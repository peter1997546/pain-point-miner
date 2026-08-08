import { createEntryCatalogSignalSources } from "./entry-catalog-signal-sources.js";
import { createPainPointMiner } from "./create-pain-point-miner.js";
import {
  createFetchHttpClient,
  type AdapterHttpClient,
} from "./json-http-client.js";
import {
  createLocalEmbeddings,
  type LocalEmbeddingsInit,
} from "./local-embeddings.js";
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

/** Product default is free/local; OpenAI-compatible is optional/experimental. */
export type LiveEmbeddingsBackend = "local" | "openai-compatible";

export type LiveDiscoveryMinerDeps = {
  /**
   * Live Embeddings backend. Default `local` (ADR-0012) — no paid API key.
   * Set `openai-compatible` only for experiments (requires `apiKey`).
   */
  embeddingsBackend?: LiveEmbeddingsBackend;
  /**
   * Options for the free/local Embeddings default (model, cacheDir, test inject).
   */
  localEmbeddings?: LocalEmbeddingsInit;
  /**
   * API key for experimental OpenAI-compatible Embeddings only.
   * Not required for the product live path.
   */
  apiKey?: string;
  /** Default `text-embedding-3-small` (openai-compatible backend only). */
  embeddingModel?: string;
  /** Default `https://api.openai.com/v1` (openai-compatible backend only). */
  embeddingBaseUrl?: string;
  /** Scripted / recorded fetch for experimental embeddings HTTP (CI). */
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
 * Entry Catalog cold start + Follow-on / Store Second Pass + Embeddings.
 *
 * Product default Embeddings are free/local (ADR-0012). OpenAI-compatible
 * adapters remain optional/experimental. Does not pair Entry Catalog Evidence
 * with hash-only fixture Embeddings. Script CLI offline defaults remain
 * `createFixture*` without `--live`.
 */
export function createLiveDiscoveryMiner(
  deps: LiveDiscoveryMinerDeps = {},
): PainPointMiner {
  const http = deps.http ?? createFetchHttpClient();
  const embeddings = deps.embeddings ?? createLiveEmbeddings(deps);

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
  const backend = deps.embeddingsBackend ?? "local";

  if (backend === "openai-compatible") {
    if (!deps.apiKey) {
      throw new Error(
        "createLiveDiscoveryMiner openai-compatible backend requires apiKey " +
          "(or OPENAI_API_KEY), or inject embeddings / use the default local backend",
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

  return createLocalEmbeddings(deps.localEmbeddings ?? {});
}
