import { describe, expect, it, vi } from "vitest";
import {
  bakeLocalEmbeddingModel,
  createLocalEmbeddings,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR,
  resolveLocalEmbeddingsCacheDir,
} from "../index.js";

/**
 * Seams under test (ticket #37 / ADR-0012):
 * - bakeLocalEmbeddingModel — install/snapshot bake populates the discoverable cache
 * - resolveLocalEmbeddingsCacheDir / createLocalEmbeddings — same cache path as live load
 * Injectable `populate` keeps CI offline (no Hub / large weight download).
 */

describe("Bake local embedding model into snapshot cache", () => {
  it("populates the default discoverable cache directory for the product model", async () => {
    const populate = vi.fn(async () => undefined);

    const result = await bakeLocalEmbeddingModel({
      env: {},
      populate,
    });

    expect(result).toEqual({
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      cacheDir: DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR,
    });
    expect(populate).toHaveBeenCalledOnce();
    expect(populate).toHaveBeenCalledWith({
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      cacheDir: DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR,
    });
  });

  it("honors PPM_EMBEDDINGS_CACHE_DIR the same way live Embeddings discovery does", async () => {
    const env = { PPM_EMBEDDINGS_CACHE_DIR: "/tmp/ppm-baked-models" };
    const populate = vi.fn(async () => undefined);

    const baked = await bakeLocalEmbeddingModel({ env, populate });
    const discovered = resolveLocalEmbeddingsCacheDir(undefined, env);

    expect(baked.cacheDir).toBe(discovered);
    expect(baked.cacheDir).toBe("/tmp/ppm-baked-models");
    expect(populate).toHaveBeenCalledWith({
      model: DEFAULT_LOCAL_EMBEDDING_MODEL,
      cacheDir: "/tmp/ppm-baked-models",
    });
  });

  it("lets createLocalEmbeddings load from the baked cache path without Hub download", async () => {
    const cacheDir = "/tmp/ppm-offline-bake";
    const vectors = [[0.1, 0.2, 0.3]] as const;

    await bakeLocalEmbeddingModel({
      cacheDir,
      populate: async () => undefined,
    });

    const embeddings = createLocalEmbeddings({
      cacheDir,
      allowRemoteModels: false,
      async embedBatch(texts) {
        expect(texts).toEqual(["probe"]);
        return [...vectors];
      },
    });

    await expect(embeddings.embed(["probe"])).resolves.toEqual([[0.1, 0.2, 0.3]]);
  });

  it("surfaces a clear error when populate fails", async () => {
    await expect(
      bakeLocalEmbeddingModel({
        env: {},
        populate: async () => {
          throw new Error("Hub unreachable");
        },
      }),
    ).rejects.toThrow(/bake|local embedding|Hub unreachable/i);
  });
});
