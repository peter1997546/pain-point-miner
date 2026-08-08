import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  resolveLocalEmbeddingsCacheDir,
} from "./local-embeddings.js";

export type BakeLocalEmbeddingModelInit = {
  /** Default {@link DEFAULT_LOCAL_EMBEDDING_MODEL}. */
  model?: string;
  /**
   * Directory for baked weights.
   * Default: `PPM_EMBEDDINGS_CACHE_DIR` or `.pain-point-miner/models`.
   */
  cacheDir?: string;
  /** Env for cache resolution; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Test / advanced seam — populate cache without Hub download in CI.
   * Default loads Transformers.js feature-extraction into `cacheDir`.
   */
  populate?: (args: {
    model: string;
    cacheDir: string;
  }) => Promise<void>;
};

export type BakeLocalEmbeddingModelResult = {
  model: string;
  cacheDir: string;
};

/**
 * Download / ensure free/local embedding weights under the discoverable cache
 * directory used by `createLocalEmbeddings` (ADR-0012 / ticket #37).
 *
 * Cloud Agent environment `install` runs this so the snapshot bakes weights
 * and subsequent agent runs do not re-download on the happy path.
 * CI injects `populate` — never downloads large model weights in tests.
 */
export async function bakeLocalEmbeddingModel(
  init: BakeLocalEmbeddingModelInit = {},
): Promise<BakeLocalEmbeddingModelResult> {
  const model = init.model ?? DEFAULT_LOCAL_EMBEDDING_MODEL;
  const cacheDir = resolveLocalEmbeddingsCacheDir(
    init.cacheDir,
    init.env ?? process.env,
  );
  const populate = init.populate ?? defaultPopulateLocalEmbeddingModel;

  try {
    await mkdir(resolve(cacheDir), { recursive: true });
    await populate({ model, cacheDir });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to bake local embedding model (${detail}). ` +
        `model=${model} cacheDir=${cacheDir}`,
      { cause: error },
    );
  }

  return { model, cacheDir };
}

async function defaultPopulateLocalEmbeddingModel(args: {
  model: string;
  cacheDir: string;
}): Promise<void> {
  const absoluteCacheDir = resolve(args.cacheDir);
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = absoluteCacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  await pipeline("feature-extraction", args.model);
}
