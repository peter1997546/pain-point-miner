import { describe, expect, it, vi } from "vitest";
import {
  createLocalEmbeddings,
  createPainPointMiner,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  resolveLocalEmbeddingsCacheDir,
  type EvidenceRef,
  type SignalSource,
} from "../index.js";

/**
 * Seams under test (ticket #35 / ADR-0012):
 * - createLocalEmbeddings — free/local Embeddings port (injectable embedBatch; no Hub download in CI)
 * - PainPointMiner.run — Candidate Cluster meaning similarity via that port
 * - resolveLocalEmbeddingsCacheDir — discoverable cache path for snapshot bake (#37)
 */

const INVOICE_VEC_A = [1, 0, 0] as const;
const INVOICE_VEC_B = [0.995, 0.1, 0] as const;
const SCHEDULE_VEC = [0, 1, 0] as const;

function evidence(
  partial: Omit<EvidenceRef, "url" | "signalSource"> &
    Partial<Pick<EvidenceRef, "url" | "signalSource">>,
): EvidenceRef {
  return {
    url: partial.url ?? `https://example.com/${partial.id}`,
    signalSource: partial.signalSource ?? "reddit",
    ...partial,
  };
}

function sourceFrom(
  name: string,
  items: readonly EvidenceRef[],
): SignalSource {
  return {
    name,
    async collect() {
      return items;
    },
  };
}

describe("Free/local Embeddings", () => {
  const paraphraseA = evidence({
    id: "inv-a",
    quote: "I chase unpaid invoices in a spreadsheet every Friday",
  });
  const paraphraseB = evidence({
    id: "inv-b",
    quote:
      "Still hunting clients for money they owe — no tool for late payments",
  });
  const unrelated = evidence({
    id: "sched",
    quote: "Need a better way to book client appointments across time zones",
  });

  it("exposes a mid-size default model id and resolvable cache directory", () => {
    expect(DEFAULT_LOCAL_EMBEDDING_MODEL.length).toBeGreaterThan(0);
    expect(DEFAULT_LOCAL_EMBEDDING_MODEL).not.toMatch(/openai|text-embedding-3/i);
    expect(resolveLocalEmbeddingsCacheDir(undefined, {})).toBe(
      ".pain-point-miner/models",
    );
    expect(
      resolveLocalEmbeddingsCacheDir(undefined, {
        PPM_EMBEDDINGS_CACHE_DIR: "/tmp/ppm-models",
      }),
    ).toBe("/tmp/ppm-models");
    expect(resolveLocalEmbeddingsCacheDir("/explicit/models", {})).toBe(
      "/explicit/models",
    );
  });

  it("embeds via injectable local batch (no paid API, no Hub download)", async () => {
    const embedBatch = vi.fn(async (texts: readonly string[]) =>
      texts.map((text) => {
        if (text === paraphraseA.quote) return [...INVOICE_VEC_A];
        if (text === paraphraseB.quote) return [...INVOICE_VEC_B];
        if (text === unrelated.quote) return [...SCHEDULE_VEC];
        throw new Error(`unexpected text: ${text}`);
      }),
    );

    const embeddings = createLocalEmbeddings({ embedBatch });
    await expect(
      embeddings.embed([paraphraseA.quote, paraphraseB.quote]),
    ).resolves.toEqual([
      [...INVOICE_VEC_A],
      [...INVOICE_VEC_B],
    ]);
    expect(embedBatch).toHaveBeenCalledOnce();
    await expect(embeddings.embed([])).resolves.toEqual([]);
  });

  it("drives Candidate Cluster meaning similarity for paraphrase Evidence", async () => {
    const embeddings = createLocalEmbeddings({
      async embedBatch(texts) {
        return texts.map((text) => {
          if (text === paraphraseA.quote) return [...INVOICE_VEC_A];
          if (text === paraphraseB.quote) return [...INVOICE_VEC_B];
          if (text === unrelated.quote) return [...SCHEDULE_VEC];
          throw new Error(`unexpected text: ${text}`);
        });
      },
    });

    const miner = createPainPointMiner({
      signalSources: [
        sourceFrom("reddit", [paraphraseA, paraphraseB, unrelated]),
      ],
      embeddings,
    });

    const artifact = await miner.run({});
    const byId = new Map<string, string>();
    for (const cluster of artifact.candidateClusters) {
      for (const item of cluster.evidence) {
        byId.set(item.id, cluster.id);
      }
    }

    expect(byId.get("inv-a")).toBe(byId.get("inv-b"));
    expect(byId.get("inv-a")).not.toBe(byId.get("sched"));
    expect(artifact.candidateClusters).toHaveLength(2);
  });

  it("surfaces a clear error when the local model/extractor cannot load", async () => {
    const embeddings = createLocalEmbeddings({
      loadExtractor: async () => {
        throw new Error("Local embedding model unavailable at cache path");
      },
    });

    await expect(embeddings.embed(["hello"])).rejects.toThrow(
      /local embedding|unavailable/i,
    );
  });
});
