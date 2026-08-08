import type {
  CandidateCluster,
  Intent,
  RunArtifact,
} from "./types.js";

/**
 * Condensed Script → Skill handoff (ADR-0009).
 * Carries gated Candidate Clusters for per-cluster Analysis Pass — not the
 * full scrape `evidence[]` corpus. Optional live-source degradation notes
 * travel with the handoff for the Run Report (ADR-0014 / ADR-0015).
 */
export type SkillMiningHandoff = {
  intent: Intent;
  gatedClusters: CandidateCluster[];
  saturationStopped: boolean;
  /**
   * Skipped or degraded live sources (e.g. token-gated Follow-on).
   * Empty when nothing was skipped / not a live run.
   */
  sourceDegradationNotes: readonly string[];
};

export type ToSkillMiningHandoffOptions = {
  sourceDegradationNotes?: readonly string[];
};

/** Project a mining RunArtifact down to what the Skill may load for analysis. */
export function toSkillMiningHandoff(
  artifact: RunArtifact,
  options: ToSkillMiningHandoffOptions = {},
): SkillMiningHandoff {
  return {
    intent: artifact.intent,
    gatedClusters: artifact.gatedClusters,
    saturationStopped: artifact.saturationStopped,
    sourceDegradationNotes: options.sourceDegradationNotes ?? [],
  };
}
