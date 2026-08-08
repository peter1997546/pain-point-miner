import { applyCompetitionFilter } from "./competition-filter.js";
import { clusterEvidence } from "./cluster-evidence.js";
import {
  followOnFetchDegradationNote,
  signalSourceDegradationNote,
  storeSecondPassDegradationNote,
} from "./live-source-degradation-notes.js";
import { partitionAnalysisOutcomes } from "./partition-analysis-outcomes.js";
import type {
  AnalysisOutcome,
  CandidateCluster,
  EvidenceRef,
  FollowOnTarget,
  Intent,
  MentionedApp,
  PainPointMiner,
  PainPointMinerDeps,
  RunArtifact,
  RunInput,
} from "./types.js";
import {
  DEFAULT_COUNT_GATE_THRESHOLD,
  DEFAULT_MEANING_SIMILARITY_THRESHOLD,
  DEFAULT_SATURATION_STOP_K,
  DEFAULT_STRUCTURAL_KEY_SIMILARITY_THRESHOLD,
  FORUM_SIGNAL_SOURCES,
  mentionedAppKey,
} from "./types.js";

const EMPTY_INTENT: Intent = {};

async function buildClusters(
  evidence: readonly EvidenceRef[],
  deps: PainPointMinerDeps,
  countGateThreshold: number,
): Promise<CandidateCluster[]> {
  const embeddings =
    evidence.length === 0
      ? []
      : await deps.embeddings.embed(evidence.map((item) => item.quote));
  return clusterEvidence(evidence, {
    embeddings,
    meaningSimilarityThreshold:
      deps.meaningSimilarityThreshold ?? DEFAULT_MEANING_SIMILARITY_THRESHOLD,
    structuralKeySimilarityThreshold:
      deps.structuralKeySimilarityThreshold ??
      DEFAULT_STRUCTURAL_KEY_SIMILARITY_THRESHOLD,
    countGateThreshold,
  });
}

function gatedClustersOf(
  clusters: readonly CandidateCluster[],
): CandidateCluster[] {
  return clusters.filter((cluster) => cluster.passedCountGate);
}

function appendUniqueEvidence(
  evidence: EvidenceRef[],
  batch: readonly EvidenceRef[],
): void {
  const seen = new Set(evidence.map((item) => item.id));
  for (const item of batch) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      evidence.push(item);
    }
  }
}

/**
 * Prefer Demand Signal deepenings over generic alternative/review pages
 * when ordering Follow-on Fetch (ADR-0008).
 */
function planFollowOnTargets(
  evidence: readonly EvidenceRef[],
): FollowOnTarget[] {
  const byUrl = new Map<string, FollowOnTarget>();
  for (const item of evidence) {
    for (const target of item.followOnTargets ?? []) {
      const existing = byUrl.get(target.url);
      if (!existing) {
        byUrl.set(target.url, target);
        continue;
      }
      // Demand Signal wins if the same URL was labeled both ways.
      if (
        existing.kind === "alternative-review" &&
        target.kind === "demand-signal"
      ) {
        byUrl.set(target.url, target);
      }
    }
  }

  return [...byUrl.values()].sort((left, right) => {
    if (left.kind === right.kind) {
      return left.url.localeCompare(right.url);
    }
    return left.kind === "demand-signal" ? -1 : 1;
  });
}

function planMentionedApps(evidence: readonly EvidenceRef[]): MentionedApp[] {
  const byKey = new Map<string, MentionedApp>();
  for (const item of evidence) {
    if (!FORUM_SIGNAL_SOURCES.has(item.signalSource)) {
      continue;
    }
    for (const app of item.mentionedApps ?? []) {
      const key = mentionedAppKey(app);
      if (!byKey.has(key)) {
        byKey.set(key, app);
      }
    }
  }
  return [...byKey.values()].sort((left, right) => {
    const storeCmp = left.store.localeCompare(right.store);
    return storeCmp !== 0 ? storeCmp : left.id.localeCompare(right.id);
  });
}

type SaturationState = {
  evidence: EvidenceRef[];
  candidateClusters: CandidateCluster[];
  saturationStopped: boolean;
};

async function ingestBatch(
  state: SaturationState,
  batch: readonly EvidenceRef[],
  deps: PainPointMinerDeps,
  countGateThreshold: number,
  saturationStopK: number,
): Promise<void> {
  if (state.saturationStopped || batch.length === 0) {
    return;
  }
  appendUniqueEvidence(state.evidence, batch);
  state.candidateClusters = await buildClusters(
    state.evidence,
    deps,
    countGateThreshold,
  );
  if (gatedClustersOf(state.candidateClusters).length >= saturationStopK) {
    state.saturationStopped = true;
  }
}

export function createPainPointMiner(
  deps: PainPointMinerDeps,
): PainPointMiner {
  return {
    async run(input: RunInput = {}): Promise<RunArtifact> {
      const intent = input.intent ?? EMPTY_INTENT;
      const countGateThreshold =
        input.countGateThreshold ?? DEFAULT_COUNT_GATE_THRESHOLD;
      const saturationStopK =
        input.saturationStopK ?? DEFAULT_SATURATION_STOP_K;

      const state: SaturationState = {
        evidence: [],
        candidateClusters: [],
        saturationStopped: false,
      };
      const sourceDegradationNotes: string[] = [];

      for (const source of deps.signalSources) {
        // Intent preference notes are echoed and forwarded to Analysis Pass only —
        // they must not select, whitelist, or drop Signal Sources (ADR-0004).
        // One failing Signal Source must not void the run (spec #4 / #23).
        let batch: readonly EvidenceRef[] = [];
        try {
          batch = await source.collect();
        } catch (error) {
          // Degrade to an empty batch; surface a Builder-facing note (ticket #43).
          sourceDegradationNotes.push(
            signalSourceDegradationNote(source.name, error),
          );
        }
        await ingestBatch(
          state,
          batch,
          deps,
          countGateThreshold,
          saturationStopK,
        );
        if (state.saturationStopped) {
          break;
        }
      }

      // Re-plan after each deepen so pages discovered mid-run are pursued.
      // One failing Follow-on page must not void the run (spec #29).
      if (deps.followOnFetcher) {
        const fetchedUrls = new Set<string>();
        while (!state.saturationStopped) {
          const next = planFollowOnTargets(state.evidence).find(
            (target) => !fetchedUrls.has(target.url),
          );
          if (!next) {
            break;
          }
          fetchedUrls.add(next.url);
          let batch: readonly EvidenceRef[] = [];
          try {
            batch = await deps.followOnFetcher.fetchPage(next.url);
          } catch (error) {
            // Degrade to an empty batch; surface a Builder-facing note (ticket #43).
            sourceDegradationNotes.push(
              followOnFetchDegradationNote(next.url, error),
            );
          }
          await ingestBatch(
            state,
            batch,
            deps,
            countGateThreshold,
            saturationStopK,
          );
        }
      }

      // One failing Store Second Pass lookup must not void the run (spec #29).
      if (deps.storeReviewSource && !state.saturationStopped) {
        const apps = planMentionedApps(state.evidence);
        for (const app of apps) {
          let batch: readonly EvidenceRef[] = [];
          try {
            batch = await deps.storeReviewSource.fetchReviews(app);
          } catch (error) {
            // Degrade to an empty batch; surface a Builder-facing note (ticket #43).
            sourceDegradationNotes.push(
              storeSecondPassDegradationNote(app, error),
            );
          }
          await ingestBatch(
            state,
            batch,
            deps,
            countGateThreshold,
            saturationStopK,
          );
          if (state.saturationStopped) {
            break;
          }
        }
      }

      const gatedClusters = gatedClustersOf(state.candidateClusters);
      const analysisOutcomes: AnalysisOutcome[] = [];

      // Per-cluster Analysis Pass (ADR-0011) — one gated cluster per call.
      // Intent (Theme, product shape, constraints, hard nos, success definition)
      // arrives here as preference notes only.
      if (deps.analysisPass) {
        for (const cluster of gatedClusters) {
          analysisOutcomes.push(
            await deps.analysisPass.analyze({
              cluster,
              intent,
            }),
          );
        }
      }

      const { briefs, hollowRejections } =
        partitionAnalysisOutcomes(analysisOutcomes);
      const { visible, hidden } = applyCompetitionFilter(
        briefs,
        input.competitionFilterThreshold,
      );

      return {
        intent,
        evidence: state.evidence,
        candidateClusters: state.candidateClusters,
        gatedClusters,
        saturationStopped: state.saturationStopped,
        analysisOutcomes,
        briefs,
        hollowRejections,
        visibleBriefs: visible,
        hiddenByCompetitionFilter: hidden,
        sourceDegradationNotes,
      };
    },
  };
}
