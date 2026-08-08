import type {
  CandidateCluster,
  Intent,
  RunArtifact,
} from "./types.js";

/**
 * Condensed Script → Skill handoff (ADR-0009).
 * Carries gated Candidate Clusters for per-cluster Analysis Pass — not the
 * full scrape `evidence[]` corpus.
 */
export type SkillMiningHandoff = {
  intent: Intent;
  gatedClusters: CandidateCluster[];
  saturationStopped: boolean;
};

/** Project a mining RunArtifact down to what the Skill may load for analysis. */
export function toSkillMiningHandoff(
  artifact: RunArtifact,
): SkillMiningHandoff {
  return {
    intent: artifact.intent,
    gatedClusters: artifact.gatedClusters,
    saturationStopped: artifact.saturationStopped,
  };
}
