import { mentionedAppKey, type MentionedApp } from "./types.js";

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
 * Collect token-gated skip notes for the Skill handoff / Run Report.
 * Pure — does not perform network I/O. Runtime port failures are recorded on
 * `RunArtifact.sourceDegradationNotes` and merged at handoff projection.
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

/** Port-level note when an Entry Catalog Signal Source throws. */
export function signalSourceDegradationNote(
  sourceName: string,
  error: unknown,
): string {
  return `Signal Source "${sourceName}" degraded: ${errorMessage(error)}`;
}

/** Port-level note when Follow-on Fetch throws for one URL. */
export function followOnFetchDegradationNote(
  url: string,
  error: unknown,
): string {
  return `Follow-on Fetch degraded for ${url}: ${errorMessage(error)}`;
}

/** Port-level note when Store Second Pass throws for one mentioned app. */
export function storeSecondPassDegradationNote(
  app: MentionedApp,
  error: unknown,
): string {
  return `Store Second Pass degraded for ${mentionedAppKey(app)}: ${errorMessage(error)}`;
}

/**
 * Merge Builder-facing degradation note groups without dropping either set.
 * Later groups append; duplicates within the merge are kept once (first wins).
 */
export function mergeSourceDegradationNotes(
  ...groups: readonly (readonly string[] | undefined)[]
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group) {
      continue;
    }
    for (const note of group) {
      if (seen.has(note)) {
        continue;
      }
      seen.add(note);
      merged.push(note);
    }
  }
  return merged;
}
