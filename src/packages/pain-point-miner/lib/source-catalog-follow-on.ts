import { createIndieHackersFollowOnFetcher } from "./indie-hackers-follow-on.js";
import type { AdapterHttpClient } from "./json-http-client.js";
import { createProductHuntFollowOnFetcher } from "./product-hunt-follow-on.js";
import type { FollowOnFetcher } from "./types.js";

export type SourceCatalogFollowOnDeps = {
  http: AdapterHttpClient;
  /** Required to deepen Product Hunt URLs; omit to skip PH fetches. */
  productHuntAccessToken?: string;
};

/**
 * Follow-on composer for Source Catalog pages that are not cold-start:
 * Product Hunt + Indie Hackers when referenced. Other URLs return [].
 */
export function createSourceCatalogFollowOnFetcher(
  deps: SourceCatalogFollowOnDeps,
): FollowOnFetcher {
  const indieHackers = createIndieHackersFollowOnFetcher({ http: deps.http });
  const productHunt = deps.productHuntAccessToken
    ? createProductHuntFollowOnFetcher({
        http: deps.http,
        accessToken: deps.productHuntAccessToken,
      })
    : undefined;

  return {
    async fetchPage(url: string) {
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
