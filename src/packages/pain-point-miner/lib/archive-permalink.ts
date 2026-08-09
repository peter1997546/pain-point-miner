/**
 * Pure conversion: canonical Reddit URL / id → Archive Permalink (ADR-0016).
 * Archive Permalinks are Arctic Shift search UI id-lookup deep links derived
 * from stable Reddit fullnames — not invented artifacts.
 */

/** Arctic Shift search UI base (Builder-openable Archive Permalink host). */
export const ARCTIC_SHIFT_SEARCH_UI_BASE =
  "https://arctic-shift.photon-reddit.com/search";

/** Arctic Shift HTTP API base used by Reddit (via archive) adapters. */
export const ARCTIC_SHIFT_API_BASE =
  "https://arctic-shift.photon-reddit.com";

const REDDIT_ID_RE = /^[A-Za-z0-9]+$/;
const FULLNAME_RE = /^(t[13])_([A-Za-z0-9]+)$/i;

/** Concrete Reddit post or comment identity resolved from a URL / id. */
export type RedditThingRef =
  | { kind: "post"; id: string }
  | { kind: "comment"; id: string };

function archivePermalinkForFullname(fullname: string): string {
  const url = new URL(ARCTIC_SHIFT_SEARCH_UI_BASE);
  url.searchParams.set("fun", "ids");
  url.searchParams.set("ids", fullname);
  return url.toString();
}

export function isRedditHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "reddit.com" ||
    host === "www.reddit.com" ||
    host === "old.reddit.com" ||
    host === "np.reddit.com" ||
    host === "new.reddit.com"
  );
}

export function isRedditShortHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "redd.it" || host === "www.redd.it";
}

/**
 * Resolve a concrete Reddit post/comment identity from a URL, fullname, or
 * bare post id. Returns undefined when the input is not a recognizable
 * thread/comment identity (e.g. subreddit homepage).
 */
export function parseRedditThingRef(
  redditUrlOrId: string,
): RedditThingRef | undefined {
  const trimmed = redditUrlOrId.trim();
  if (!trimmed) {
    return undefined;
  }

  const asFullname = trimmed.match(FULLNAME_RE);
  if (asFullname) {
    const kind = asFullname[1]!.toLowerCase();
    const id = asFullname[2]!;
    return kind === "t1" ? { kind: "comment", id } : { kind: "post", id };
  }

  if (REDDIT_ID_RE.test(trimmed) && !trimmed.includes("://")) {
    return { kind: "post", id: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (isRedditShortHost(parsed.hostname)) {
    const id = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    if (!id || !REDDIT_ID_RE.test(id)) {
      return undefined;
    }
    return { kind: "post", id };
  }

  if (!isRedditHost(parsed.hostname)) {
    return undefined;
  }

  // /r/<sub>/comments/<postId>/<slug>/[<commentId>/]
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

/**
 * Convert a canonical Reddit URL, redd.it short link, bare fullname (`t3_` /
 * `t1_`), or bare post id into an Archive Permalink.
 * Returns `undefined` when the input is not a recognizable Reddit identity.
 */
export function toArchivePermalink(redditUrlOrId: string): string | undefined {
  const thing = parseRedditThingRef(redditUrlOrId);
  if (!thing) {
    return undefined;
  }
  const fullname =
    thing.kind === "comment" ? `t1_${thing.id}` : `t3_${thing.id}`;
  return archivePermalinkForFullname(fullname);
}
