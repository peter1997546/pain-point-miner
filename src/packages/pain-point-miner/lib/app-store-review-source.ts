import type { JsonHttpClient } from "./json-http-client.js";
import { asString, isRecord, pathGet } from "./parse-unknown.js";
import type { EvidenceRef, MentionedApp, StoreReviewSource } from "./types.js";

export type AppStoreReviewSourceDeps = {
  http: JsonHttpClient;
};

function labeledString(value: unknown): string | undefined {
  return asString(pathGet(value, ["label"]));
}

function isNumericAppId(id: string): boolean {
  return /^\d+$/.test(id);
}

async function resolveAppStoreId(
  http: JsonHttpClient,
  appId: string,
): Promise<string | undefined> {
  if (isNumericAppId(appId)) {
    return appId;
  }
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", appId);
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", "5");
  const payload = await http.getJson(url.toString());
  const results = pathGet(payload, ["results"]);
  if (!Array.isArray(results)) {
    return undefined;
  }
  for (const result of results) {
    if (!isRecord(result)) {
      continue;
    }
    const trackId = result.trackId;
    if (typeof trackId === "number" && Number.isFinite(trackId)) {
      return String(trackId);
    }
    const asText = asString(trackId);
    if (asText && isNumericAppId(asText)) {
      return asText;
    }
  }
  return undefined;
}

function reviewsFeedUrl(numericId: string): string {
  return `https://itunes.apple.com/us/rss/customerreviews/page=1/id=${numericId}/sortby=mostrecent/json`;
}

function parseReviewsFeed(
  payload: unknown,
  mentionedId: string,
  numericId: string,
): EvidenceRef[] {
  const entry = pathGet(payload, ["feed", "entry"]);
  const entries = Array.isArray(entry) ? entry : entry ? [entry] : [];
  const evidence: EvidenceRef[] = [];

  for (const item of entries) {
    const rating = labeledString(pathGet(item, ["im:rating"]));
    if (!rating) {
      // First feed entry is often app metadata without a rating.
      continue;
    }
    const id = labeledString(pathGet(item, ["id"]));
    const title = labeledString(pathGet(item, ["title"])) ?? "";
    const content = labeledString(pathGet(item, ["content"])) ?? "";
    if (!id || (!title && !content)) {
      continue;
    }
    const quote = title && content ? `${title}\n\n${content}` : title || content;
    evidence.push({
      id: `app-store-${id}`,
      quote,
      url: `https://apps.apple.com/us/app/id${numericId}?reviewId=${id}`,
      signalSource: "app-store",
      signalKind: "incumbent-friction",
      structuralKey: mentionedId,
    });
  }
  return evidence;
}

/**
 * App Store Store Second Pass — reviews for a mentioned app only.
 * Resolves non-numeric ids via iTunes search; failures degrade to [].
 */
export function createAppStoreReviewSource(
  deps: AppStoreReviewSourceDeps,
): StoreReviewSource {
  return {
    async fetchReviews(app: MentionedApp) {
      if (app.store !== "app-store") {
        return [];
      }
      try {
        const numericId = await resolveAppStoreId(deps.http, app.id);
        if (!numericId) {
          return [];
        }
        const payload = await deps.http.getJson(reviewsFeedUrl(numericId));
        return parseReviewsFeed(payload, app.id, numericId);
      } catch {
        return [];
      }
    },
  };
}
