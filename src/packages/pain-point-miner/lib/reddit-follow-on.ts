import {
  ARCTIC_SHIFT_API_BASE,
  toArchivePermalink,
} from "./archive-permalink.js";
import { withExtractedHints } from "./extract-evidence-hints.js";
import type { JsonHttpClient } from "./json-http-client.js";
import { asArray, asString, isRecord } from "./parse-unknown.js";
import type { EvidenceRef, FollowOnFetcher } from "./types.js";

export type RedditFollowOnDeps = {
  http: JsonHttpClient;
};

type RedditThingRef =
  | { kind: "post"; id: string }
  | { kind: "comment"; id: string };

const REDDIT_ID_RE = /^[A-Za-z0-9]+$/;

function hostIsReddit(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "reddit.com" ||
    host === "www.reddit.com" ||
    host === "old.reddit.com" ||
    host === "np.reddit.com" ||
    host === "new.reddit.com"
  );
}

function hostIsRedditShort(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "redd.it" || host === "www.redd.it";
}

/**
 * Resolve a concrete Reddit post/comment identity from a Follow-on URL.
 * Non-thread Reddit URLs and non-Reddit hosts return undefined.
 */
function redditThingRefFromUrl(url: string): RedditThingRef | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }

  if (hostIsRedditShort(parsed.hostname)) {
    const id = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    if (!id || !REDDIT_ID_RE.test(id)) {
      return undefined;
    }
    return { kind: "post", id };
  }

  if (!hostIsReddit(parsed.hostname)) {
    return undefined;
  }

  const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
  const commentsIdx = parts.indexOf("comments");
  if (commentsIdx === -1) {
    return undefined;
  }
  const postId = parts[commentsIdx + 1];
  if (!postId || !REDDIT_ID_RE.test(postId)) {
    return undefined;
  }
  const commentId = parts[commentsIdx + 3];
  if (commentId && REDDIT_ID_RE.test(commentId)) {
    return { kind: "comment", id: commentId };
  }
  return { kind: "post", id: postId };
}

function archiveIdsLookupUrl(thing: RedditThingRef): string {
  const path =
    thing.kind === "post" ? "/api/posts/ids" : "/api/comments/ids";
  const url = new URL(`${ARCTIC_SHIFT_API_BASE}${path}`);
  url.searchParams.set("ids", thing.id);
  return url.toString();
}

function canonicalFromPermalink(
  permalink: string | undefined,
  fallbackUrl: string,
): string {
  if (permalink) {
    const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
    return `https://www.reddit.com${path}`;
  }
  try {
    const parsed = new URL(fallbackUrl);
    if (hostIsRedditShort(parsed.hostname)) {
      return fallbackUrl;
    }
    if (hostIsReddit(parsed.hostname)) {
      return `https://www.reddit.com${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // keep fallback
  }
  return fallbackUrl;
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

  if (thing.kind === "comment") {
    const body = asString(row.body);
    if (!body) {
      return undefined;
    }
    const url = canonicalFromPermalink(asString(row.permalink), requestUrl);
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
  const url = canonicalFromPermalink(asString(row.permalink), requestUrl);
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
      const thing = redditThingRefFromUrl(url);
      if (!thing) {
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
