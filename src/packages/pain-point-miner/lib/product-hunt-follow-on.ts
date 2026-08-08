import type { AdapterHttpClient } from "./json-http-client.js";
import { asString, isRecord, pathGet } from "./parse-unknown.js";
import type { EvidenceRef, FollowOnFetcher } from "./types.js";

export type ProductHuntFollowOnDeps = {
  http: Pick<AdapterHttpClient, "postJson">;
  /** Developer / user token for Product Hunt GraphQL (required for live). */
  accessToken: string;
};

const PRODUCT_HUNT_GRAPHQL = "https://api.producthunt.com/v2/api/graphql";

const POST_QUERY = `
query PostBySlug($slug: String!) {
  post(slug: $slug) {
    id
    name
    tagline
    description
    url
  }
}
`.trim();

export function productHuntSlugFromUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "producthunt.com") {
    return undefined;
  }
  const match = parsed.pathname.match(
    /^\/(?:posts|products)\/([^/]+)\/?$/i,
  );
  const slug = match?.[1];
  return slug && slug.length > 0 ? decodeURIComponent(slug) : undefined;
}

function evidenceFromPost(post: Record<string, unknown>): EvidenceRef | undefined {
  const id = asString(post.id);
  const name = asString(post.name);
  const tagline = asString(post.tagline) ?? "";
  const description = asString(post.description) ?? "";
  const url =
    asString(post.url) ??
    (name
      ? `https://www.producthunt.com/posts/${encodeURIComponent(name)}`
      : undefined);
  if (!id || !name || !url) {
    return undefined;
  }
  const parts = [name, tagline, description].filter((part) => part.length > 0);
  return {
    id: `product-hunt-${id}`,
    quote: parts.join("\n\n"),
    url,
    signalSource: "product-hunt",
    signalKind: "incumbent-friction",
  };
}

/**
 * Product Hunt Follow-on — fetches a concrete post/product page by slug.
 * Non-PH URLs return []. GraphQL failures degrade to [].
 * Not part of Entry Catalog cold-start (ADR-0010).
 */
export function createProductHuntFollowOnFetcher(
  deps: ProductHuntFollowOnDeps,
): FollowOnFetcher {
  return {
    async fetchPage(url: string) {
      const slug = productHuntSlugFromUrl(url);
      if (!slug) {
        return [];
      }
      try {
        const payload = await deps.http.postJson(
          PRODUCT_HUNT_GRAPHQL,
          { query: POST_QUERY, variables: { slug } },
          {
            headers: {
              Authorization: `Bearer ${deps.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        const post = pathGet(payload, ["data", "post"]);
        if (!isRecord(post)) {
          return [];
        }
        const evidence = evidenceFromPost(post);
        return evidence ? [evidence] : [];
      } catch {
        return [];
      }
    },
  };
}
