import { createHackerNewsSignalSource } from "./hacker-news-signal-source.js";
import type { JsonHttpClient } from "./json-http-client.js";
import { createRedditSignalSource } from "./reddit-signal-source.js";
import type { SignalSource } from "./types.js";

export type EntryCatalogSignalSourcesDeps = {
  http: JsonHttpClient;
};

/**
 * Cold-start Entry Catalog wave: Reddit primary boards + HN Ask HN searches.
 * Does not include Product Hunt, Indie Hackers, or deprioritized founder boards
 * (ADR-0010) — those belong to Follow-on / later waves.
 */
export function createEntryCatalogSignalSources(
  deps: EntryCatalogSignalSourcesDeps,
): SignalSource[] {
  return [
    createRedditSignalSource({ http: deps.http }),
    createHackerNewsSignalSource({ http: deps.http }),
  ];
}
