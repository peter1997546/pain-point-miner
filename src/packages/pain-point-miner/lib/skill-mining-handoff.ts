import { mergeSourceDegradationNotes } from "./live-source-degradation-notes.js";
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
   * Skipped or degraded live sources (token-gated Follow-on + runtime port
   * failures). Empty when nothing was skipped / degraded.
   */
  sourceDegradationNotes: readonly string[];
};

export type ToSkillMiningHandoffOptions = {
  /**
   * Composition-time notes (e.g. token-gated skips from
   * `liveSourceDegradationNotes`). Merged with runtime notes from the
   * mining `RunArtifact` — neither set overwrites the other.
   */
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
    sourceDegradationNotes: mergeSourceDegradationNotes(
      options.sourceDegradationNotes,
      artifact.sourceDegradationNotes,
    ),
  };
}
