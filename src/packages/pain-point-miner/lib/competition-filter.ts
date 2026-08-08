import type { Brief } from "./types.js";

/**
 * Builder-controlled Competition Filter (ADR-0001).
 * Hides Briefs with competitionDensity above the threshold; never deletes
 * annotations from the full set the caller already holds.
 * When `threshold` is undefined, every Brief stays visible.
 */
export function applyCompetitionFilter(
  briefs: readonly Brief[],
  threshold: number | undefined,
): { visible: Brief[]; hidden: Brief[] } {
  if (threshold === undefined) {
    return { visible: [...briefs], hidden: [] };
  }

  const visible: Brief[] = [];
  const hidden: Brief[] = [];
  for (const brief of briefs) {
    if (brief.competitionDensity > threshold) {
      hidden.push(brief);
    } else {
      visible.push(brief);
    }
  }
  return { visible, hidden };
}
