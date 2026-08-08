import type { FollowOnKind, FollowOnTarget, MentionedApp } from "./types.js";

const PRODUCT_HUNT_URL_RE =
  /https?:\/\/(?:www\.)?producthunt\.com\/posts\/[A-Za-z0-9._-]+/gi;
const INDIE_HACKERS_URL_RE =
  /https?:\/\/(?:www\.)?indiehackers\.com\/(?:post|product)\/[A-Za-z0-9._-]+/gi;
const APP_STORE_ID_RE =
  /https?:\/\/(?:apps|itunes)\.apple\.com\/[^\s"']*?\/id(\d+)/gi;
const PLAY_PACKAGE_RE =
  /https?:\/\/play\.google\.com\/store\/apps\/details\?[^\s"'<>]*?\bid=([A-Za-z0-9._]+)/gi;

function uniqueUrls(matches: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[).,;]+$/g, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/**
 * Pull concrete Follow-on URLs (PH / IH) and store app ids out of free text
 * so live Entry Catalog Evidence can seed Follow-on + Store Second Pass.
 */
export function extractEvidenceHints(text: string): {
  followOnTargets: FollowOnTarget[];
  mentionedApps: MentionedApp[];
} {
  const followOnTargets: FollowOnTarget[] = [];
  for (const url of uniqueUrls(text.match(PRODUCT_HUNT_URL_RE) ?? [])) {
    followOnTargets.push({ url, kind: "alternative-review" satisfies FollowOnKind });
  }
  for (const url of uniqueUrls(text.match(INDIE_HACKERS_URL_RE) ?? [])) {
    followOnTargets.push({ url, kind: "demand-signal" });
  }

  const mentionedApps: MentionedApp[] = [];
  const seenApps = new Set<string>();
  for (const match of text.matchAll(APP_STORE_ID_RE)) {
    const id = match[1];
    if (!id) continue;
    const key = `app-store:${id}`;
    if (seenApps.has(key)) continue;
    seenApps.add(key);
    mentionedApps.push({ id, store: "app-store" });
  }
  for (const match of text.matchAll(PLAY_PACKAGE_RE)) {
    const id = match[1];
    if (!id) continue;
    const key = `play:${id}`;
    if (seenApps.has(key)) continue;
    seenApps.add(key);
    mentionedApps.push({ id, store: "play" });
  }

  return { followOnTargets, mentionedApps };
}

/** Attach extracted hints only when present (keeps Evidence payloads lean). */
export function withExtractedHints<T extends { quote: string }>(
  evidence: T,
): T & {
  followOnTargets?: FollowOnTarget[];
  mentionedApps?: MentionedApp[];
} {
  const { followOnTargets, mentionedApps } = extractEvidenceHints(
    evidence.quote,
  );
  return {
    ...evidence,
    ...(followOnTargets.length > 0 ? { followOnTargets } : {}),
    ...(mentionedApps.length > 0 ? { mentionedApps } : {}),
  };
}
