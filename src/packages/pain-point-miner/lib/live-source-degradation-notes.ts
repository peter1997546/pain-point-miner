/**
 * Builder-facing notes when live deepenings were skipped or degraded
 * (ADR-0014). Token-free Entry Catalog paths stay preferred; missing tokens
 * must not block the run — only surface what could not deepen.
 */
export type LiveSourceDegradationNotesInput = {
  /** Product Hunt GraphQL access token; omit / empty → PH Follow-on skipped. */
  productHuntAccessToken?: string;
};

/** Stable note when Product Hunt Follow-on cannot run without credentials. */
export const PRODUCT_HUNT_FOLLOW_ON_SKIPPED_NOTE =
  "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)";

/**
 * Collect source degradation notes for the Skill handoff / Run Report.
 * Pure — does not perform network I/O.
 */
export function liveSourceDegradationNotes(
  input: LiveSourceDegradationNotesInput = {},
): string[] {
  const notes: string[] = [];
  const token = input.productHuntAccessToken?.trim();
  if (!token) {
    notes.push(PRODUCT_HUNT_FOLLOW_ON_SKIPPED_NOTE);
  }
  return notes;
}
