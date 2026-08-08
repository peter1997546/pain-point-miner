import {
  ENTRY_CATALOG_REDDIT_BOARDS,
  ENTRY_CATALOG_REDDIT_DEMAND_QUERIES,
} from "./entry-catalog.js";
import { withExtractedHints } from "./extract-evidence-hints.js";
import type { JsonHttpClient } from "./json-http-client.js";
import { asString, isRecord } from "./parse-unknown.js";
import type { EvidenceRef, SignalSource } from "./types.js";

export type RedditSignalSourceDeps = {
  http: JsonHttpClient;
};

type RedditPostData = {
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
};

function parseRedditListing(payload: unknown): EvidenceRef[] {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return [];
  }
  const children = payload.data.children;
  if (!Array.isArray(children)) {
    return [];
  }

  const evidence: EvidenceRef[] = [];
  for (const child of children) {
    if (!isRecord(child) || !isRecord(child.data)) {
      continue;
    }
    const post = child.data as RedditPostData;
    const id = asString(post.id);
    const title = asString(post.title);
    const permalink = asString(post.permalink);
    if (!id || !title || !permalink) {
      continue;
    }
    const selftext = asString(post.selftext);
    const quote = selftext ? `${title}\n\n${selftext}` : title;
    const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
    evidence.push(
      withExtractedHints({
        id: `reddit-${id}`,
        quote,
        url: `https://www.reddit.com${path}`,
        signalSource: "reddit",
        signalKind: "demand-signal",
      }),
    );
  }
  return evidence;
}

function redditSearchUrl(board: string, query: string): string {
  const url = new URL(
    `https://www.reddit.com/r/${encodeURIComponent(board)}/search.json`,
  );
  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", "new");
  url.searchParams.set("limit", "25");
  return url.toString();
}

/**
 * Reddit Entry Catalog Signal Source — primary boards × demand queries.
 * Per-request failures degrade to an empty batch for that URL so one broken
 * search does not void the adapter (spec #4 graceful degradation).
 */
export function createRedditSignalSource(
  deps: RedditSignalSourceDeps,
): SignalSource {
  return {
    name: "reddit",
    async collect() {
      const evidence: EvidenceRef[] = [];
      const seen = new Set<string>();

      for (const board of ENTRY_CATALOG_REDDIT_BOARDS) {
        for (const query of ENTRY_CATALOG_REDDIT_DEMAND_QUERIES) {
          const url = redditSearchUrl(board, query);
          try {
            const payload = await deps.http.getJson(url);
            for (const item of parseRedditListing(payload)) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                evidence.push(item);
              }
            }
          } catch {
            // Skip this board/query; continue the rest of the catalog.
          }
        }
      }

      return evidence;
    },
  };
}
