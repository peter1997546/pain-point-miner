import type {
  EvidenceRef,
  FollowOnFetcher,
  MentionedApp,
  StoreReviewSource,
} from "./types.js";
import { mentionedAppKey } from "./types.js";

/**
 * Fixture Follow-on Fetcher keyed by page URL (no live network).
 * Unknown URLs return an empty batch.
 */
export function createFixtureFollowOnFetcher(
  pages:
    | ReadonlyMap<string, readonly EvidenceRef[]>
    | Record<string, readonly EvidenceRef[]>,
): FollowOnFetcher {
  const byUrl =
    pages instanceof Map ? pages : new Map(Object.entries(pages));
  return {
    async fetchPage(url: string) {
      return byUrl.get(url) ?? [];
    },
  };
}

/**
 * Fixture Store Second Pass keyed by `store:id` (no live network).
 * Only apps the miner requests are returned — nothing is swept by default.
 */
export function createFixtureStoreReviewSource(
  reviewsByApp:
    | ReadonlyMap<string, readonly EvidenceRef[]>
    | Record<string, readonly EvidenceRef[]>,
): StoreReviewSource {
  const byKey =
    reviewsByApp instanceof Map
      ? reviewsByApp
      : new Map(Object.entries(reviewsByApp));
  return {
    async fetchReviews(app: MentionedApp) {
      return byKey.get(mentionedAppKey(app)) ?? [];
    },
  };
}
