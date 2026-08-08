import {
  ENTRY_CATALOG_REDDIT_BOARDS,
  ENTRY_CATALOG_REDDIT_DEMAND_QUERIES,
} from "./entry-catalog.js";
import type { JsonHttpClient } from "./json-http-client.js";
import type { EvidenceRef, SignalSource } from "./types.js";

export type RedditSignalSourceDeps = {
  http: JsonHttpClient;
  boards?: readonly string[];
  queries?: readonly string[];
};

type RedditPostData = {
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

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
    evidence.push({
      id: `reddit-${id}`,
      quote,
      url: `https://www.reddit.com${path}`,
      signalSource: "reddit",
      signalKind: "demand-signal",
    });
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
 * Per-request failures degrade to an empty batch for that URL (ADR graceful
 * degradation) so one broken search does not void the adapter.
 */
export function createRedditSignalSource(
  deps: RedditSignalSourceDeps,
): SignalSource {
  const boards = deps.boards ?? ENTRY_CATALOG_REDDIT_BOARDS;
  const queries = deps.queries ?? ENTRY_CATALOG_REDDIT_DEMAND_QUERIES;

  return {
    name: "reddit",
    async collect() {
      const evidence: EvidenceRef[] = [];
      const seen = new Set<string>();

      for (const board of boards) {
        for (const query of queries) {
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
