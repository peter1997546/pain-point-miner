import {
  ARCTIC_SHIFT_API_BASE,
  isRedditHost,
  parseRedditThingRef,
  toArchivePermalink,
  type RedditThingRef,
} from "./archive-permalink.js";
import { withExtractedHints } from "./extract-evidence-hints.js";
import type { JsonHttpClient } from "./json-http-client.js";
import { asArray, asString, isRecord } from "./parse-unknown.js";
import type { EvidenceRef, FollowOnFetcher } from "./types.js";

export type RedditFollowOnDeps = {
  http: JsonHttpClient;
};

function archiveIdsLookupUrl(thing: RedditThingRef): string {
  const path =
    thing.kind === "post" ? "/api/posts/ids" : "/api/comments/ids";
  const url = new URL(`${ARCTIC_SHIFT_API_BASE}${path}`);
  url.searchParams.set("ids", thing.id);
  return url.toString();
}

/**
 * Builder-facing canonical Reddit URL — always www.reddit.com when possible
 * (CONTEXT.md Evidence), never leave a redd.it short link as Evidence.url.
 */
function canonicalRedditUrl(
  row: Record<string, unknown>,
  thing: RedditThingRef,
  requestUrl: string,
): string {
  const permalink = asString(row.permalink);
  if (permalink) {
    const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
    return `https://www.reddit.com${path}`;
  }

  const subreddit = asString(row.subreddit);
  if (thing.kind === "comment") {
    const linkId = asString(row.link_id)?.replace(/^t3_/i, "");
    if (subreddit && linkId) {
      return `https://www.reddit.com/r/${subreddit}/comments/${linkId}/_/${thing.id}/`;
    }
  } else if (subreddit) {
    return `https://www.reddit.com/r/${subreddit}/comments/${thing.id}/`;
  }

  try {
    const parsed = new URL(requestUrl);
    if (isRedditHost(parsed.hostname)) {
      return `https://www.reddit.com${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // fall through
  }

  if (thing.kind === "comment") {
    return `https://www.reddit.com/comments/${thing.id}/`;
  }
  return `https://www.reddit.com/comments/${thing.id}/`;
}

function evidenceFromArchiveRow(
  row: Record<string, unknown>,
  thing: RedditThingRef,
  requestUrl: string,
): EvidenceRef | undefined {
  const id = asString(row.id) ?? thing.id;
  const archivePermalink =
    toArchivePermalink(
      thing.kind === "comment" ? `t1_${id}` : `t3_${id}`,
    ) ?? toArchivePermalink(requestUrl);
  if (!archivePermalink) {
    return undefined;
  }

  const url = canonicalRedditUrl(row, thing, requestUrl);

  if (thing.kind === "comment") {
    const body = asString(row.body);
    if (!body) {
      return undefined;
    }
    return withExtractedHints({
      id: `reddit-${id}`,
      quote: body,
      url,
      archivePermalink,
      signalSource: "reddit",
      signalKind: "demand-signal" as const,
    });
  }

  const title = asString(row.title);
  if (!title) {
    return undefined;
  }
  const selftext = asString(row.selftext);
  const quote = selftext ? `${title}\n\n${selftext}` : title;
  return withExtractedHints({
    id: `reddit-${id}`,
    quote,
    url,
    archivePermalink,
    signalSource: "reddit",
    signalKind: "demand-signal" as const,
  });
}

function firstArchiveRow(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const rows = asArray(payload.data);
  if (!rows || rows.length === 0) {
    return undefined;
  }
  const row = rows[0];
  return isRecord(row) ? row : undefined;
}

/**
 * Reddit (via archive) Follow-on — deepens concrete Reddit thread/comment URLs
 * through Arctic Shift id lookup (ADR-0016). Non-Reddit URLs return [].
 * Missing/failed archive lookups throw so the miner can note degradation.
 */
export function createRedditFollowOnFetcher(
  deps: RedditFollowOnDeps,
): FollowOnFetcher {
  return {
    async fetchPage(url: string) {
      const thing = parseRedditThingRef(url);
      // Follow-on only deepens concrete URL targets (not bare ids / fullnames).
      if (!thing || !/^https?:\/\//i.test(url.trim())) {
        return [];
      }

      const lookupUrl = archiveIdsLookupUrl(thing);
      let payload: unknown;
      try {
        payload = await deps.http.getJson(lookupUrl);
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Reddit (via archive) unavailable for ${url}: ${detail}`,
        );
      }

      if (isRecord(payload) && typeof payload.error === "string") {
        throw new Error(
          `Reddit (via archive) unavailable for ${url}: ${payload.error}`,
        );
      }

      const row = firstArchiveRow(payload);
      if (!row) {
        throw new Error(
          `Reddit (via archive) missing for ${url} (id ${thing.id})`,
        );
      }

      const evidence = evidenceFromArchiveRow(row, thing, url);
      if (!evidence) {
        throw new Error(
          `Reddit (via archive) unavailable for ${url}: unreadable archive payload`,
        );
      }
      return [evidence];
    },
  };
}
