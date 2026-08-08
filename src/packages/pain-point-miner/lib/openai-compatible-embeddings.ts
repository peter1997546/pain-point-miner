import { asArray, asNumber, isRecord, pathGet } from "./parse-unknown.js";
import type { Embeddings } from "./types.js";

export type OpenAiCompatibleEmbeddingsInit = {
  apiKey: string;
  /** Default `text-embedding-3-small`. */
  model?: string;
  /** Default `https://api.openai.com/v1`. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * OpenAI Embeddings–compatible client implementing the injectable `Embeddings`
 * port (no SDK dependency). Optional / experimental — the product live path
 * defaults to free/local Embeddings (ADR-0012). Tests / CI inject `fetchImpl`
 * with recordings. Script CLI without `--live` stays on fixture Embeddings.
 */
export function createOpenAiCompatibleEmbeddings(
  init: OpenAiCompatibleEmbeddingsInit,
): Embeddings {
  const fetchImpl = init.fetchImpl ?? fetch;
  const model = init.model ?? "text-embedding-3-small";
  const baseUrl = (init.baseUrl ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );

  return {
    async embed(texts: readonly string[]) {
      if (texts.length === 0) {
        return [];
      }

      const response = await fetchImpl(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${init.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [...texts],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Embeddings HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const payload: unknown = await response.json();
      return parseEmbeddingPayload(payload, texts.length);
    },
  };
}

function parseEmbeddingPayload(
  payload: unknown,
  expectedCount: number,
): number[][] {
  const data = asArray(pathGet(payload, ["data"]));
  if (!data) {
    throw new Error("Embeddings response missing data array");
  }

  const byIndex = new Map<number, number[]>();
  for (const entry of data) {
    if (!isRecord(entry)) {
      continue;
    }
    const index = asNumber(entry.index);
    const embedding = asArray(entry.embedding);
    if (index === undefined || !embedding) {
      continue;
    }
    const vector: number[] = [];
    for (const value of embedding) {
      const component = asNumber(value);
      if (component === undefined) {
        throw new Error(
          `Embeddings response has non-numeric vector at index ${index}`,
        );
      }
      vector.push(component);
    }
    byIndex.set(index, vector);
  }

  const ordered: number[][] = [];
  for (let i = 0; i < expectedCount; i += 1) {
    const vector = byIndex.get(i);
    if (!vector) {
      throw new Error(`Embeddings response missing vector for index ${i}`);
    }
    ordered.push(vector);
  }
  return ordered;
}
