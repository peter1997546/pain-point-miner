import { resolve } from "node:path";
import type { Embeddings } from "./types.js";

/**
 * Mid-size free/open sentence embedding model (ONNX via Transformers.js).
 * Chosen for meaning similarity quality without a huge Cloud snapshot burden
 * (ADR-0012). Ticket #37 bakes weights under the cache directory.
 */
export const DEFAULT_LOCAL_EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

/** Default on-disk cache for downloaded / snapshot-baked model weights. */
export const DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR = ".pain-point-miner/models";

/**
 * Minimal extractor surface used by the local Embeddings adapter.
 * Matches Transformers.js feature-extraction output shape.
 */
export type LocalEmbeddingExtractor = (
  texts: string | readonly string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number>; dims: number[] }>;

export type LocalEmbeddingsInit = {
  /** Default {@link DEFAULT_LOCAL_EMBEDDING_MODEL}. */
  model?: string;
  /**
   * Directory for model weights.
   * Default: `PPM_EMBEDDINGS_CACHE_DIR` or {@link DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR}.
   */
  cacheDir?: string;
  /**
   * When false, refuse Hub download (offline / snapshot-only).
   * Default true so a first local run can populate the cache if not baked yet.
   */
  allowRemoteModels?: boolean;
  /** Env for cache resolution; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Test seam — scripted vectors; skips Transformers.js / Hub entirely.
   */
  embedBatch?: (
    texts: readonly string[],
  ) => Promise<readonly (readonly number[])[]>;
  /** Advanced / test seam — custom pipeline loader. */
  loadExtractor?: () => Promise<LocalEmbeddingExtractor>;
};

export function resolveLocalEmbeddingsCacheDir(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    explicit ??
    env.PPM_EMBEDDINGS_CACHE_DIR ??
    DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR
  );
}

/**
 * Free/local Embeddings implementation of the injectable `Embeddings` port
 * (ADR-0012). Product live path default — no paid embedding API.
 *
 * CI / unit tests inject `embedBatch` (or `loadExtractor`) so they never
 * download model weights. Live / Cloud Agent loads Transformers.js against
 * the cache directory (baked by environment install — ticket #37).
 */
export function createLocalEmbeddings(
  init: LocalEmbeddingsInit = {},
): Embeddings {
  const embedBatch = init.embedBatch;
  let extractorPromise: Promise<LocalEmbeddingExtractor> | undefined;

  return {
    async embed(texts: readonly string[]) {
      if (texts.length === 0) {
        return [];
      }
      if (embedBatch) {
        return embedBatch(texts);
      }

      try {
        extractorPromise ??= loadLocalExtractor(init);
        const extractor = await extractorPromise;
        return await extractVectors(extractor, texts);
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Local embedding model unavailable (${detail}). ` +
            "Ensure free/local Embeddings weights are baked or cached " +
            `(cacheDir=${resolveLocalEmbeddingsCacheDir(init.cacheDir, init.env ?? process.env)}), ` +
            "or inject an Embeddings port / localEmbeddings.embedBatch.",
          { cause: error },
        );
      }
    },
  };
}

async function loadLocalExtractor(
  init: LocalEmbeddingsInit,
): Promise<LocalEmbeddingExtractor> {
  if (init.loadExtractor) {
    return init.loadExtractor();
  }

  return loadTransformersFeatureExtractor({
    model: init.model ?? DEFAULT_LOCAL_EMBEDDING_MODEL,
    cacheDir: resolveLocalEmbeddingsCacheDir(init.cacheDir, init.env ?? process.env),
    allowRemoteModels: init.allowRemoteModels ?? true,
  });
}

/**
 * Shared Transformers.js feature-extraction load for live Embeddings and
 * snapshot bake (same cacheDir / model contract).
 */
export async function loadTransformersFeatureExtractor(options: {
  model: string;
  cacheDir: string;
  allowRemoteModels: boolean;
}): Promise<LocalEmbeddingExtractor> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = resolve(options.cacheDir);
  env.allowLocalModels = true;
  env.allowRemoteModels = options.allowRemoteModels;

  const extractor = await pipeline("feature-extraction", options.model);
  return extractor as LocalEmbeddingExtractor;
}

async function extractVectors(
  extractor: LocalEmbeddingExtractor,
  texts: readonly string[],
): Promise<number[][]> {
  const output = await extractor([...texts], {
    pooling: "mean",
    normalize: true,
  });

  const dims = output.dims;
  if (dims.length === 1) {
    // Single text → flat vector.
    return [Array.from(output.data)];
  }
  if (dims.length === 2) {
    const [batch, hidden] = dims;
    if (batch === undefined || hidden === undefined) {
      throw new Error("Local embeddings returned incomplete dims");
    }
    if (batch !== texts.length) {
      throw new Error(
        `Local embeddings batch size mismatch: expected ${texts.length}, got ${batch}`,
      );
    }
    const data = Array.from(output.data);
    const vectors: number[][] = [];
    for (let i = 0; i < batch; i += 1) {
      vectors.push(data.slice(i * hidden, (i + 1) * hidden));
    }
    return vectors;
  }

  throw new Error(
    `Local embeddings returned unexpected dims: [${dims.join(", ")}]`,
  );
}
