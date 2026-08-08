import type { AdapterHttpClient } from "./json-http-client.js";
import { asArray, asNumber, asString, pathGet } from "./parse-unknown.js";
import type { EvidenceRef, MentionedApp, StoreReviewSource } from "./types.js";

export type PlayStoreReviewSourceDeps = {
  http: Pick<AdapterHttpClient, "postForm">;
};

const PLAY_REVIEWS_URL =
  "https://play.google.com/_/PlayStoreUi/data/batchexecute?hl=en&gl=us";

/** Newest sort — matches google-play-scraper's sort.NEWEST value. */
const PLAY_SORT_NEWEST = 2;
const PLAY_PAGE_SIZE = 40;
/** Play storefront batchexecute RPC id for the reviews list. */
const PLAY_REVIEWS_RPC_ID = "UsvDTd";

function buildPlayReviewsBody(packageName: string): string {
  const pageSpec: [number, null, null] = [PLAY_PAGE_SIZE, null, null];
  const innerRequest = JSON.stringify([
    null,
    null,
    [2, PLAY_SORT_NEWEST, pageSpec, null, []],
    [packageName, 7],
  ]);
  const envelope = JSON.stringify([
    [[PLAY_REVIEWS_RPC_ID, innerRequest, null, "generic"]],
  ]);
  return `f.req=${encodeURIComponent(envelope)}`;
}

/**
 * batchexecute responses start with the anti-JSON-hijacking prefix ")]}'".
 * envelope[0][2] is a JSON string with the review payload.
 */
export function parsePlayBatchExecuteResponse(body: string): unknown {
  const withoutPrefix = body.startsWith(")]}'") ? body.slice(4) : body;
  const trimmed = withoutPrefix.trim();
  let envelope: unknown;
  try {
    envelope = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  const inner = pathGet(envelope, [0, 2]);
  if (typeof inner !== "string" || inner.length === 0) {
    return null;
  }
  try {
    return JSON.parse(inner) as unknown;
  } catch {
    return null;
  }
}

function extractPlayReviews(
  payload: unknown,
  packageName: string,
): EvidenceRef[] {
  const rawReviews = asArray(pathGet(payload, [0]));
  if (!rawReviews) {
    return [];
  }

  const evidence: EvidenceRef[] = [];
  for (const raw of rawReviews) {
    // Play batchexecute review tuple: [id, author…, score, ?, text, …]
    const reviewId = asString(pathGet(raw, [0]));
    const reviewText = asString(pathGet(raw, [4]));
    if (!reviewId || !reviewText) {
      continue;
    }
    const starRating = asNumber(pathGet(raw, [2]));
    const scorePrefix =
      starRating === undefined ? "Play review" : `Play ${starRating}★ review`;
    evidence.push({
      id: `play-${reviewId}`,
      quote: `${scorePrefix}: ${reviewText}`,
      url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&reviewId=${encodeURIComponent(reviewId)}`,
      signalSource: "play",
      signalKind: "incumbent-friction",
      structuralKey: packageName,
    });
  }
  return evidence;
}

/**
 * Google Play Store Second Pass — reviews for a mentioned package only.
 * Uses Play's public batchexecute RPC (same shape as the web storefront).
 * Per-request failures degrade to [] (spec #4).
 */
export function createPlayStoreReviewSource(
  deps: PlayStoreReviewSourceDeps,
): StoreReviewSource {
  return {
    async fetchReviews(app: MentionedApp) {
      if (app.store !== "play") {
        return [];
      }
      try {
        const body = await deps.http.postForm(
          PLAY_REVIEWS_URL,
          buildPlayReviewsBody(app.id),
        );
        const payload = parsePlayBatchExecuteResponse(body);
        if (payload === null) {
          return [];
        }
        return extractPlayReviews(payload, app.id);
      } catch {
        return [];
      }
    },
  };
}
