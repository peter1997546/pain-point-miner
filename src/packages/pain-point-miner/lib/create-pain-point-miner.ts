import { clusterEvidence } from "./cluster-evidence.js";
import type {
  CandidateCluster,
  EvidenceRef,
  Intent,
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

      const evidence: EvidenceRef[] = [];
      let candidateClusters: CandidateCluster[] = [];
      let saturationStopped = false;

      for (const source of deps.signalSources) {
        // Intent is echoed on the artifact but does not select Signal Sources.
        const batch = await source.collect();
        evidence.push(...batch);

        candidateClusters = await buildClusters(
          evidence,
          deps,
          countGateThreshold,
        );
        if (gatedClustersOf(candidateClusters).length >= saturationStopK) {
          saturationStopped = true;
          break;
        }
      }

      return {
        intent,
        evidence,
        candidateClusters,
        gatedClusters: gatedClustersOf(candidateClusters),
        saturationStopped,
      };
    },
  };
}
