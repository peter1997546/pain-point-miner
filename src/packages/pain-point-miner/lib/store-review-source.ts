import { createAppStoreReviewSource } from "./app-store-review-source.js";
import type { AdapterHttpClient } from "./json-http-client.js";
import { createPlayStoreReviewSource } from "./play-store-review-source.js";
import type { MentionedApp, StoreReviewSource } from "./types.js";

export type StoreReviewSourceDeps = {
  http: AdapterHttpClient;
};

/**
 * Composite Store Second Pass — routes mentioned apps to App Store or Play.
 * Only apps the miner requests are fetched (no preset catalog sweep).
 */
export function createStoreReviewSource(
  deps: StoreReviewSourceDeps,
): StoreReviewSource {
  const appStore = createAppStoreReviewSource({ http: deps.http });
  const play = createPlayStoreReviewSource({ http: deps.http });

  return {
    async fetchReviews(app: MentionedApp) {
      if (app.store === "app-store") {
        return appStore.fetchReviews(app);
      }
      if (app.store === "play") {
        return play.fetchReviews(app);
      }
      return [];
    },
  };
}
