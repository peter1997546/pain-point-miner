import type {
  AnalysisOutcome,
  Brief,
  HollowRejection,
} from "./types.js";

/** Split Analysis Pass outcomes into surviving Briefs vs Hollow rejections. */
export function partitionAnalysisOutcomes(
  outcomes: readonly AnalysisOutcome[],
): {
  briefs: Brief[];
  hollowRejections: HollowRejection[];
} {
  const briefs: Brief[] = [];
  const hollowRejections: HollowRejection[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === "hollow") {
      const { status: _status, ...rejection } = outcome;
      hollowRejections.push(rejection);
    } else {
      briefs.push(outcome.brief);
    }
  }
  return { briefs, hollowRejections };
}
