/**
 * Cloud environment install / local prep: bake Xenova/bge-small-en-v1.5
 * into the discoverable cache used by createLocalEmbeddings (ADR-0012 / #37).
 *
 *   npm run bake:local-embeddings
 *   PPM_EMBEDDINGS_CACHE_DIR=/path/to/models npm run bake:local-embeddings
 */
import { bakeLocalEmbeddingModel } from "../src/packages/pain-point-miner/lib/bake-local-embeddings.js";

const result = await bakeLocalEmbeddingModel();
console.log(
  `Baked local embedding model ${result.model} into ${result.cacheDir}`,
);
