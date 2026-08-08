import { createEntryCatalogSignalSources } from "./entry-catalog-signal-sources.js";
import { createPainPointMiner } from "./create-pain-point-miner.js";
import {
  createFetchHttpClient,
  type AdapterHttpClient,
} from "./json-http-client.js";
import { createOpenAiCompatibleEmbeddings } from "./openai-compatible-embeddings.js";
import { createSourceCatalogFollowOnFetcher } from "./source-catalog-follow-on.js";
import { createStoreReviewSource } from "./store-review-source.js";
import type {
  Embeddings,
  FollowOnFetcher,
  PainPointMiner,
  SignalSource,
  StoreReviewSource,
} from "./types.js";

export type LiveDiscoveryMinerDeps = {
  /**
   * OpenAI-compatible API key for live Embeddings.
   * Required unless `embeddings` is injected (tests).
   */
  apiKey?: string;
  /** Default `text-embedding-3-small`. */
  embeddingModel?: string;
  /** Default `https://api.openai.com/v1`. */
  embeddingBaseUrl?: string;
  /** Scripted / recorded fetch for embeddings HTTP (CI). */
  embeddingsFetchImpl?: typeof fetch;
  /** Optional Product Hunt token for Follow-on GraphQL deepenings. */
  productHuntAccessToken?: string;
  /** HTTP for Entry Catalog / Follow-on / Store; default live fetch client. */
  http?: AdapterHttpClient;
  /** Overrides — injectable doubles for CI; omit for live adapters. */
  signalSources?: readonly SignalSource[];
  embeddings?: Embeddings;
  followOnFetcher?: FollowOnFetcher;
  storeReviewSource?: StoreReviewSource;
};

/**
 * First-class live discovery composition behind `PainPointMiner.run`:
 * Entry Catalog cold start + Follow-on / Store Second Pass + live Embeddings.
 *
 * Does not pair Entry Catalog Evidence with hash-only fixture Embeddings.
 * Script CLI offline defaults remain `createFixture*` without `--live`.
 */
export function createLiveDiscoveryMiner(
  deps: LiveDiscoveryMinerDeps = {},
): PainPointMiner {
  const http = deps.http ?? createFetchHttpClient();
  const embeddings =
    deps.embeddings ?? createLiveEmbeddings(deps);

  return createPainPointMiner({
    signalSources:
      deps.signalSources ?? createEntryCatalogSignalSources({ http }),
    embeddings,
    followOnFetcher:
      deps.followOnFetcher ??
      createSourceCatalogFollowOnFetcher({
        http,
        ...(deps.productHuntAccessToken !== undefined
          ? { productHuntAccessToken: deps.productHuntAccessToken }
          : {}),
      }),
    storeReviewSource:
      deps.storeReviewSource ?? createStoreReviewSource({ http }),
  });
}

function createLiveEmbeddings(deps: LiveDiscoveryMinerDeps): Embeddings {
  if (!deps.apiKey) {
    throw new Error(
      "createLiveDiscoveryMiner requires apiKey (or OPENAI_API_KEY) for live Embeddings, or an injected embeddings port",
    );
  }

  return createOpenAiCompatibleEmbeddings({
    apiKey: deps.apiKey,
    ...(deps.embeddingModel !== undefined
      ? { model: deps.embeddingModel }
      : {}),
    ...(deps.embeddingBaseUrl !== undefined
      ? { baseUrl: deps.embeddingBaseUrl }
      : {}),
    ...(deps.embeddingsFetchImpl !== undefined
      ? { fetchImpl: deps.embeddingsFetchImpl }
      : {}),
  });
}
