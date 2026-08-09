import {
  ARCTIC_SHIFT_API_BASE,
  toArchivePermalink,
} from "./archive-permalink.js";
import {
  ENTRY_CATALOG_REDDIT_BOARDS,
  ENTRY_CATALOG_REDDIT_DEMAND_QUERIES,
} from "./entry-catalog.js";
import { withExtractedHints } from "./extract-evidence-hints.js";
import type { JsonHttpClient } from "./json-http-client.js";
import { asArray, asString, isRecord } from "./parse-unknown.js";
import type { EvidenceRef, SignalSource } from "./types.js";

export type RedditSignalSourceDeps = {
  http: JsonHttpClient;
};

type ArchivePost = {
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
};

function canonicalRedditUrl(post: ArchivePost, id: string): string {
  const permalink = asString(post.permalink);
  if (permalink) {
    const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
    return `https://www.reddit.com${path}`;
  }
  const subreddit = asString(post.subreddit) ?? "reddit";
  return `https://www.reddit.com/r/${subreddit}/comments/${id}/`;
}

function parseArchivePosts(payload: unknown): EvidenceRef[] {
  if (!isRecord(payload)) {
    return [];
  }
  const rows = asArray(payload.data);
  if (!rows) {
    return [];
  }

  const evidence: EvidenceRef[] = [];
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const post = row as ArchivePost;
    const id = asString(post.id);
    const title = asString(post.title);
    if (!id || !title) {
      continue;
    }
    const selftext = asString(post.selftext);
    const quote = selftext ? `${title}\n\n${selftext}` : title;
    const url = canonicalRedditUrl(post, id);
    const archivePermalink = toArchivePermalink(url) ?? toArchivePermalink(id);
    if (!archivePermalink) {
      continue;
    }
    evidence.push(
      withExtractedHints({
        id: `reddit-${id}`,
        quote,
        url,
        archivePermalink,
        signalSource: "reddit",
        signalKind: "demand-signal",
      }),
    );
  }
  return evidence;
}

/**
 * Reddit (via archive) Entry Catalog search URL — Arctic Shift posts search
 * for one board × demand query (ADR-0016). Not live reddit.com.
 */
function redditArchiveSearchUrl(board: string, query: string): string {
  const url = new URL(`${ARCTIC_SHIFT_API_BASE}/api/posts/search`);
  url.searchParams.set("subreddit", board);
  url.searchParams.set("query", query);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("limit", "25");
  return url.toString();
}

/**
 * Reddit (via archive) Entry Catalog Signal Source — primary boards × demand
 * queries via Arctic Shift (ADR-0016). Per-request failures skip that board ×
 * query so one broken archive search does not void the adapter. If every
 * archive request fails, collect throws so the miner records a degradation
 * note and other Signal Sources can continue (ADR-0016).
 */
export function createRedditSignalSource(
  deps: RedditSignalSourceDeps,
): SignalSource {
  return {
    name: "reddit",
    async collect() {
      const evidence: EvidenceRef[] = [];
      const seen = new Set<string>();
      let attempts = 0;
      let failures = 0;

      for (const board of ENTRY_CATALOG_REDDIT_BOARDS) {
        for (const query of ENTRY_CATALOG_REDDIT_DEMAND_QUERIES) {
          attempts += 1;
          const url = redditArchiveSearchUrl(board, query);
          try {
            const payload = await deps.http.getJson(url);
            for (const item of parseArchivePosts(payload)) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                evidence.push(item);
              }
            }
          } catch {
            failures += 1;
            // Skip this board/query; continue the rest of the catalog.
          }
        }
      }

      if (attempts > 0 && failures === attempts) {
        throw new Error(
          "Reddit (via archive) unavailable: all Entry Catalog archive searches failed",
        );
      }

      return evidence;
    },
  };
}
