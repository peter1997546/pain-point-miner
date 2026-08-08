import type { Embeddings } from "./types.js";

/**
 * Deterministic fixture embeddings from the full quote string hash.
 * Not bag-of-words / shared-token overlap — distinct quotes get distinct
 * directions unless tests inject a real Embeddings port.
 */
export function createFixtureEmbeddings(): Embeddings {
  return {
    async embed(texts: readonly string[]) {
      return texts.map((text) => hashToUnitVector(text));
    },
  };
}

function hashToUnitVector(text: string): number[] {
  // 8-dim vector from successive string hashes of the whole quote.
  const dims = 8;
  const vector = Array.from({ length: dims }, () => 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    const dim = i % dims;
    vector[dim] = (vector[dim] ?? 0) + ((hash >>> 0) % 1000) / 1000;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((v) => v / norm);
}
