import type { EvidenceRef, SignalMix } from "./types.js";

/** Compute Signal Mix from Evidence labels (Demand Signal vs Incumbent Friction). */
export function signalMixFromEvidence(
  evidence: readonly EvidenceRef[],
): SignalMix {
  let demandSignalCount = 0;
  let incumbentFrictionCount = 0;
  for (const item of evidence) {
    if (item.signalKind === "demand-signal") {
      demandSignalCount += 1;
    } else if (item.signalKind === "incumbent-friction") {
      incumbentFrictionCount += 1;
    }
  }
  return { demandSignalCount, incumbentFrictionCount };
}
