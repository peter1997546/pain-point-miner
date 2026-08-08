import { applyCompetitionFilter } from "./competition-filter.js";
import type {
  AnalysisOutcome,
  AnalysisPass,
  Brief,
  HollowRejection,
  PainPointMiner,
  RunArtifact,
  RunInput,
} from "./types.js";

/**
 * Skill orchestrator deps (ADR-0009 / ADR-0011).
 *
 * `runMining` is the Script / `PainPointMiner.run` mining path — crawl,
 * Follow-on, Store Second Pass, cluster, Count Gate / Saturation Stop —
 * typically without an Analysis Pass port so the Skill owns fan-out.
 */
export type SkillOrchestratorDeps = {
  /**
   * Script mining entry. Must return condensed gated Candidate Clusters;
   * must not be a chat-side re-implementation of the crawl.
   */
  runMining: (input?: RunInput) => Promise<RunArtifact>;
  /** Per-cluster Analysis Pass (test double or live LLM). */
  analysisPass: AnalysisPass;
};

/**
 * Skill adapter over the shared `run` contract: mine via Script, then
 * Analysis Pass one gated Candidate Cluster at a time (parallel fan-out).
 */
export type SkillOrchestrator = {
  run(input?: RunInput): Promise<RunArtifact>;
};

/**
 * Create the agent-facing Skill orchestrator.
 *
 * Flow:
 * 1. Call Script mining (`runMining`) for gated candidates — never crawl-in-chat.
 * 2. Fan out Analysis Pass across gated clusters in parallel; each call receives
 *    only that cluster’s Evidence plus Intent / Brief context (ADR-0011).
 * 3. Assemble Hollow rejections, Briefs, and Competition Filter views.
 */
export function createSkillOrchestrator(
  deps: SkillOrchestratorDeps,
): SkillOrchestrator {
  return {
    async run(input: RunInput = {}): Promise<RunArtifact> {
      const mining = await deps.runMining(input);
      const intent = mining.intent;

      // Parallel per-cluster fan-out — never one analysis step over the full scrape.
      const analysisOutcomes: AnalysisOutcome[] = await Promise.all(
        mining.gatedClusters.map((cluster) =>
          deps.analysisPass.analyze({ cluster, intent }),
        ),
      );

      const briefs: Brief[] = [];
      const hollowRejections: HollowRejection[] = [];
      for (const outcome of analysisOutcomes) {
        if (outcome.status === "hollow") {
          const { status: _status, ...rejection } = outcome;
          hollowRejections.push(rejection);
        } else {
          briefs.push(outcome.brief);
        }
      }

      const { visible, hidden } = applyCompetitionFilter(
        briefs,
        input.competitionFilterThreshold,
      );

      return {
        intent: mining.intent,
        evidence: mining.evidence,
        candidateClusters: mining.candidateClusters,
        gatedClusters: mining.gatedClusters,
        saturationStopped: mining.saturationStopped,
        analysisOutcomes,
        briefs,
        hollowRejections,
        visibleBriefs: visible,
        hiddenByCompetitionFilter: hidden,
      };
    },
  };
}

/**
 * Wire a Skill orchestrator to an existing Script miner (no Analysis Pass on
 * the miner itself — fan-out stays at the Skill layer).
 */
export function createSkillOrchestratorFromMiner(
  miner: PainPointMiner,
  analysisPass: AnalysisPass,
): SkillOrchestrator {
  return createSkillOrchestrator({
    runMining: (input) => miner.run(input),
    analysisPass,
  });
}
