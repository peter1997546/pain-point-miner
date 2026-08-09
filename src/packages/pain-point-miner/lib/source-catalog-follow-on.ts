import { createIndieHackersFollowOnFetcher } from "./indie-hackers-follow-on.js";
import type { AdapterHttpClient } from "./json-http-client.js";
import { createProductHuntFollowOnFetcher } from "./product-hunt-follow-on.js";
import { createRedditFollowOnFetcher } from "./reddit-follow-on.js";
import type { FollowOnFetcher } from "./types.js";

export type SourceCatalogFollowOnDeps = {
  http: AdapterHttpClient;
  /** Required to deepen Product Hunt URLs; omit to skip PH fetches. */
  productHuntAccessToken?: string;
};

/**
 * Follow-on composer for Source Catalog pages that are not cold-start:
 * Reddit (via archive), Product Hunt, and Indie Hackers when referenced.
 * Other URLs return [].
 */
export function createSourceCatalogFollowOnFetcher(
  deps: SourceCatalogFollowOnDeps,
): FollowOnFetcher {
  const reddit = createRedditFollowOnFetcher({ http: deps.http });
  const indieHackers = createIndieHackersFollowOnFetcher({ http: deps.http });
  const productHunt = deps.productHuntAccessToken
    ? createProductHuntFollowOnFetcher({
        http: deps.http,
        accessToken: deps.productHuntAccessToken,
      })
    : undefined;

  return {
    async fetchPage(url: string) {
      // Reddit URLs throw on archive miss/failure — do not swallow here so the
      // miner can record Follow-on degradation notes (ADR-0016 / ticket #50).
      const fromReddit = await reddit.fetchPage(url);
      if (fromReddit.length > 0) {
        return fromReddit;
      }
      const fromIh = await indieHackers.fetchPage(url);
      if (fromIh.length > 0) {
        return fromIh;
      }
      if (productHunt) {
        return productHunt.fetchPage(url);
      }
      return [];
    },
  };
}
