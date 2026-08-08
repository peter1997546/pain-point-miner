import { ENTRY_CATALOG_HN_ASK_QUERIES } from "./entry-catalog.js";
import type { JsonHttpClient } from "./json-http-client.js";
import type { EvidenceRef, SignalSource } from "./types.js";

export type HackerNewsSignalSourceDeps = {
  http: JsonHttpClient;
  queries?: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseHnHits(payload: unknown): EvidenceRef[] {
  if (!isRecord(payload) || !Array.isArray(payload.hits)) {
    return [];
  }

  const evidence: EvidenceRef[] = [];
  for (const hit of payload.hits) {
    if (!isRecord(hit)) {
      continue;
    }
    const objectID = asString(hit.objectID);
    const title = asString(hit.title);
    if (!objectID || !title) {
      continue;
    }
    const storyText = asString(hit.story_text);
    const quote = storyText ? `${title}\n\n${storyText}` : title;
    evidence.push({
      id: `hacker-news-${objectID}`,
      quote,
      url: `https://news.ycombinator.com/item?id=${objectID}`,
      signalSource: "hacker-news",
      signalKind: "demand-signal",
    });
  }
  return evidence;
}

function hnAskSearchUrl(query: string): string {
  const url = new URL("https://hn.algolia.com/api/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("tags", "ask_hn");
  url.searchParams.set("hitsPerPage", "20");
  return url.toString();
}

/**
 * Hacker News Entry Catalog Signal Source — Ask HN–style wish / frustration
 * searches via the Algolia HN API. Per-query failures degrade to empty.
 */
export function createHackerNewsSignalSource(
  deps: HackerNewsSignalSourceDeps,
): SignalSource {
  const queries = deps.queries ?? ENTRY_CATALOG_HN_ASK_QUERIES;

  return {
    name: "hacker-news",
    async collect() {
      const evidence: EvidenceRef[] = [];
      const seen = new Set<string>();

      for (const query of queries) {
        const url = hnAskSearchUrl(query);
        try {
          const payload = await deps.http.getJson(url);
          for (const item of parseHnHits(payload)) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              evidence.push(item);
            }
          }
        } catch {
          // Skip this query; continue the rest of the Ask HN catalog.
        }
      }

      return evidence;
    },
  };
}
