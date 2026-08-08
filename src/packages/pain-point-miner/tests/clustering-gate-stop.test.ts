import { describe, expect, it } from "vitest";
import {
  createPainPointMiner,
  formatRunArtifact,
  type Embeddings,
  type EvidenceRef,
  type SignalSource,
} from "../index.js";

/** Unit vectors for fixture-driven meaning similarity (not bag-of-words). */
const INVOICE_VEC = [1, 0, 0] as const;
const INVENTORY_VEC = [0, 1, 0] as const;
const SCHEDULING_VEC = [0, 0, 1] as const;

function embeddingsByQuote(
  mapping: Record<string, readonly number[]>,
): Embeddings {
  return {
    async embed(texts: readonly string[]) {
      return texts.map((text) => {
        const vector = mapping[text];
        if (!vector) {
          throw new Error(`Missing fixture embedding for quote: ${text}`);
        }
        return [...vector];
      });
    },
  };
}

function sourceFrom(name: string, evidence: readonly EvidenceRef[]): SignalSource {
  return {
    name,
    async collect() {
      return evidence;
    },
  };
}

function evidence(
  partial: Omit<EvidenceRef, "url" | "signalSource"> &
    Partial<Pick<EvidenceRef, "url" | "signalSource" | "structuralKey">>,
): EvidenceRef {
  return {
    url: partial.url ?? `https://example.com/${partial.id}`,
    signalSource: partial.signalSource ?? "reddit",
    ...partial,
  };
}

describe("PainPointMiner.run — Candidate Clusters, Count Gate, Saturation Stop", () => {
  it("groups Evidence by structural keys + meaning similarity, not shared-word overlap", async () => {
    const invoiceA = evidence({
      id: "inv-a",
      quote: "Freelancers need autopilot for unpaid client bills",
      structuralKey: "late-payments",
    });
    const invoiceB = evidence({
      id: "inv-b",
      quote: "Still pinging customers about money they owe me",
      structuralKey: "late-payments",
      signalSource: "hacker-news",
    });
    // Shares several words with invoice phrasing elsewhere, but different meaning vector + key.
    const inventory = evidence({
      id: "invtry",
      quote: "Freelancers need a spreadsheet for unpaid inventory bills",
      structuralKey: "stock-tracking",
    });

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [invoiceA, inventory, invoiceB])],
      embeddings: embeddingsByQuote({
        [invoiceA.quote]: INVOICE_VEC,
        [invoiceB.quote]: INVOICE_VEC,
        [inventory.quote]: INVENTORY_VEC,
      }),
    });

    const artifact = await miner.run({});

    const clustersByMember = new Map<string, string>();
    for (const cluster of artifact.candidateClusters) {
      for (const item of cluster.evidence) {
        clustersByMember.set(item.id, cluster.id);
      }
    }

    expect(clustersByMember.get("inv-a")).toBe(clustersByMember.get("inv-b"));
    expect(clustersByMember.get("inv-a")).not.toBe(clustersByMember.get("invtry"));
    expect(artifact.candidateClusters).toHaveLength(2);
  });

  it("does not merge same structuralKey when meaning vectors are orthogonal", async () => {
    const a = evidence({
      id: "a",
      quote: "invoice chase automation",
      structuralKey: "shared-key",
    });
    const b = evidence({
      id: "b",
      quote: "warehouse bin labeling",
      structuralKey: "shared-key",
    });

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [a, b])],
      embeddings: embeddingsByQuote({
        [a.quote]: INVOICE_VEC,
        [b.quote]: INVENTORY_VEC,
      }),
    });

    const artifact = await miner.run({});
    expect(artifact.candidateClusters).toHaveLength(2);
  });

  it("lets a shared structuralKey assist a below-meaning-threshold merge", async () => {
    const a = evidence({
      id: "a",
      quote: "late payment follow-ups",
      structuralKey: "payments",
    });
    const b = evidence({
      id: "b",
      quote: "dunning emails for freelancers",
      structuralKey: "payments",
    });
    // Cosine of [1,0] and normalize([1,1]) = ~0.707 — below 0.8 meaning, above 0.5 structural assist.
    const mid = [1, 1, 0] as const;

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [a, b])],
      embeddings: embeddingsByQuote({
        [a.quote]: INVOICE_VEC,
        [b.quote]: mid,
      }),
    });

    const artifact = await miner.run({});
    expect(artifact.candidateClusters).toHaveLength(1);
    expect(artifact.candidateClusters[0]!.evidenceCount).toBe(2);
  });

  it("clusters same pain across different structural keys when meaning vectors align", async () => {
    const a = evidence({
      id: "a",
      quote: "wish tool chased late payments",
      structuralKey: "board-freelance",
    });
    const b = evidence({
      id: "b",
      quote: "automatic dunning for invoices please",
      structuralKey: "board-smallbusiness",
      signalSource: "hacker-news",
    });

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("mixed", [a, b])],
      embeddings: embeddingsByQuote({
        [a.quote]: INVOICE_VEC,
        [b.quote]: INVOICE_VEC,
      }),
    });

    const artifact = await miner.run({});
    expect(artifact.candidateClusters).toHaveLength(1);
    expect(artifact.candidateClusters[0]!.evidence.map((e) => e.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("computes Evidence Count in code and applies Count Gate default N ≥ 5", async () => {
    const thin = Array.from({ length: 4 }, (_, i) =>
      evidence({
        id: `thin-${i}`,
        quote: `thin scheduling pain ${i}`,
        structuralKey: "scheduling",
      }),
    );
    const ready = Array.from({ length: 5 }, (_, i) =>
      evidence({
        id: `ready-${i}`,
        quote: `ready invoice pain ${i}`,
        structuralKey: "invoices",
      }),
    );
    const quoteVectors: Record<string, readonly number[]> = {};
    for (const item of thin) {
      quoteVectors[item.quote] = SCHEDULING_VEC;
    }
    for (const item of ready) {
      quoteVectors[item.quote] = INVOICE_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...thin, ...ready])],
      embeddings: embeddingsByQuote(quoteVectors),
    });

    const artifact = await miner.run({});

    const byKey = Object.fromEntries(
      artifact.candidateClusters.map((cluster) => {
        const key = cluster.evidence[0]!.structuralKey ?? cluster.id;
        return [key, cluster];
      }),
    );

    expect(byKey["scheduling"]!.evidenceCount).toBe(4);
    expect(byKey["scheduling"]!.passedCountGate).toBe(false);
    expect(byKey["invoices"]!.evidenceCount).toBe(5);
    expect(byKey["invoices"]!.passedCountGate).toBe(true);

    expect(artifact.gatedClusters).toHaveLength(1);
    expect(artifact.gatedClusters[0]!.evidenceCount).toBe(5);
    expect(
      artifact.gatedClusters.every((cluster) => cluster.passedCountGate),
    ).toBe(true);
    // Below-gate clusters stay visible on candidateClusters but are not analysis-ready.
    expect(artifact.candidateClusters).toHaveLength(2);
    expect(
      artifact.gatedClusters.find((c) =>
        c.evidence.some((e) => e.structuralKey === "scheduling"),
      ),
    ).toBeUndefined();

    const markdown = formatRunArtifact(artifact, "markdown");
    expect(markdown).toContain("passed Count Gate");
    expect(markdown).toContain("below Count Gate (not analysis-ready)");
  });

  it("Saturation Stop halts mining once 20 Count-Gated clusters exist", async () => {
    function clusterBatch(
      clusterIndex: number,
      sourceName: string,
    ): EvidenceRef[] {
      return Array.from({ length: 5 }, (_, i) =>
        evidence({
          id: `c${clusterIndex}-e${i}`,
          quote: `pain cluster ${clusterIndex} evidence ${i}`,
          structuralKey: `pain-${clusterIndex}`,
          signalSource: sourceName,
        }),
      );
    }

    // 21 gated clusters across sequential sources (5 Evidence each).
    const earlySources: SignalSource[] = [];
    const quoteVectors: Record<string, readonly number[]> = {};
    for (let c = 0; c < 20; c += 1) {
      const batch = clusterBatch(c, `source-${c}`);
      for (const item of batch) {
        // Orthogonal-enough directions per cluster index in 20+ dims.
        const vector = Array.from({ length: 24 }, (_, dim) =>
          dim === c ? 1 : 0,
        );
        quoteVectors[item.quote] = vector;
      }
      earlySources.push(sourceFrom(`source-${c}`, batch));
    }

    const overflowBatch = clusterBatch(20, "source-overflow");
    for (const item of overflowBatch) {
      quoteVectors[item.quote] = Array.from({ length: 24 }, (_, dim) =>
        dim === 20 ? 1 : 0,
      );
    }
    let overflowCollected = false;
    const overflowSource: SignalSource = {
      name: "source-overflow",
      async collect() {
        overflowCollected = true;
        return overflowBatch;
      },
    };

    const miner = createPainPointMiner({
      signalSources: [...earlySources, overflowSource],
      embeddings: embeddingsByQuote(quoteVectors),
    });

    const artifact = await miner.run({});

    expect(artifact.gatedClusters).toHaveLength(20);
    expect(
      artifact.gatedClusters.every(
        (cluster) => cluster.evidenceCount >= 5 && cluster.passedCountGate,
      ),
    ).toBe(true);
    expect(artifact.saturationStopped).toBe(true);
    expect(overflowCollected).toBe(false);
    expect(artifact.evidence.some((e) => e.id.startsWith("c20-"))).toBe(false);
  });
});
