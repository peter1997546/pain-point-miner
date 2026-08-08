import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import {
  createLiveDiscoveryMiner,
  type EvidenceRef,
  type FollowOnFetcher,
  type SignalSource,
  type StoreReviewSource,
} from "../index.js";

/**
 * Seams under test (ticket #24 / #35 / ADR-0012):
 * - createLiveDiscoveryMiner → PainPointMiner.run — Entry Catalog + Follow-on /
 *   Store Second Pass + free/local Embeddings composition (no hand-assembled adapters)
 * - Script CLI `--live` — same composition; fixture defaults remain without `--live`
 * - Injectable local Embeddings doubles — no paid API key and no Hub download in CI
 * - Optional openai-compatible backend remains experimental (scripted HTTP)
 */

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

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

function localEmbedBatch(
  vectorsByText: Record<string, readonly number[]>,
): (texts: readonly string[]) => Promise<number[][]> {
  return async (texts) =>
    texts.map((text) => {
      const embedding = vectorsByText[text];
      if (!embedding) {
        throw new Error(`No recorded embedding for text: ${text}`);
      }
      return [...embedding];
    });
}

function scriptedEmbeddingsFetch(
  vectorsByText: Record<string, readonly number[]>,
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    const data = body.input.map((text, index) => {
      const embedding = vectorsByText[text];
      if (!embedding) {
        throw new Error(`No recorded embedding for text: ${text}`);
      }
      return { object: "embedding", index, embedding: [...embedding] };
    });
    return new Response(JSON.stringify({ object: "list", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("Script live discovery path", () => {
  const paraphraseA = evidence({
    id: "inv-a",
    quote: "I chase unpaid invoices in a spreadsheet every Friday",
    followOnTargets: [
      {
        url: "https://www.indiehackers.com/post/invoice-pain",
        kind: "demand-signal",
      },
    ],
    mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
  });
  const paraphraseB = evidence({
    id: "inv-b",
    quote:
      "Still hunting clients for money they owe — no tool for late payments",
  });
  const unrelated = evidence({
    id: "sched-1",
    quote: "Need a better way to schedule clinic appointments",
    signalSource: "hacker-news",
  });

  const localVectors = {
    [paraphraseA.quote]: INVOICE_VEC_A,
    [paraphraseB.quote]: INVOICE_VEC_B,
    [unrelated.quote]: SCHEDULE_VEC,
    "IH: still chasing invoices manually": INVOICE_VEC_A,
    "App Store: Wave reminders never fire": INVOICE_VEC_B,
  };

  it("composes Entry Catalog + Follow-on/Store + local Embeddings behind run", async () => {
    const embedBatch = vi.fn(localEmbedBatch(localVectors));

    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        expect(url).toBe("https://www.indiehackers.com/post/invoice-pain");
        return [
          evidence({
            id: "ih-1",
            quote: "IH: still chasing invoices manually",
            url,
            signalSource: "indie-hackers",
          }),
        ];
      },
    };

    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app) {
        expect(app).toEqual({ id: "wave-accounting", store: "app-store" });
        return [
          evidence({
            id: "as-1",
            quote: "App Store: Wave reminders never fire",
            signalSource: "app-store",
          }),
        ];
      },
    };

    const entryCatalogSources: SignalSource[] = [
      sourceFrom("reddit", [paraphraseA, paraphraseB]),
      sourceFrom("hacker-news", [unrelated]),
    ];

    const miner = createLiveDiscoveryMiner({
      localEmbeddings: { embedBatch },
      signalSources: entryCatalogSources,
      followOnFetcher,
      storeReviewSource,
    });

    const artifact = await miner.run({ countGateThreshold: 3 });

    expect(embedBatch).toHaveBeenCalled();
    const sources = new Set(artifact.evidence.map((item) => item.signalSource));
    expect(sources.has("reddit")).toBe(true);
    expect(sources.has("hacker-news")).toBe(true);
    expect(sources.has("indie-hackers")).toBe(true);
    expect(sources.has("app-store")).toBe(true);

    const byEvidence = new Map<string, string>();
    for (const cluster of artifact.candidateClusters) {
      for (const item of cluster.evidence) {
        byEvidence.set(item.id, cluster.id);
      }
    }
    // Live meaning similarity — paraphrases (+ deepenings) share a cluster.
    expect(byEvidence.get("inv-a")).toBe(byEvidence.get("inv-b"));
    expect(byEvidence.get("inv-a")).toBe(byEvidence.get("ih-1"));
    expect(byEvidence.get("inv-a")).not.toBe(byEvidence.get("sched-1"));
    expect(
      artifact.gatedClusters.some((cluster) =>
        cluster.evidence.some((item) => item.id === "inv-a"),
      ),
    ).toBe(true);
  });

  it("defaults to free/local Embeddings without a paid API key", async () => {
    const embedBatch = vi.fn(localEmbedBatch(localVectors));
    const miner = createLiveDiscoveryMiner({
      localEmbeddings: { embedBatch },
      signalSources: [sourceFrom("reddit", [paraphraseA, paraphraseB])],
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });

    const artifact = await miner.run({});
    expect(embedBatch).toHaveBeenCalled();
    const byEvidence = new Map<string, string>();
    for (const cluster of artifact.candidateClusters) {
      for (const item of cluster.evidence) {
        byEvidence.set(item.id, cluster.id);
      }
    }
    expect(byEvidence.get("inv-a")).toBe(byEvidence.get("inv-b"));
  });

  it("fails clearly when local Embeddings cannot load and none were injected", async () => {
    const miner = createLiveDiscoveryMiner({
      localEmbeddings: {
        loadExtractor: async () => {
          throw new Error("Local embedding model unavailable at cache path");
        },
      },
      signalSources: [sourceFrom("reddit", [paraphraseA])],
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });

    await expect(miner.run({})).rejects.toThrow(/local embedding|unavailable/i);
  });

  it("keeps experimental openai-compatible backend behind an explicit opt-in", async () => {
    const embeddingsFetch = vi.fn(
      scriptedEmbeddingsFetch({
        [paraphraseA.quote]: INVOICE_VEC_A,
      }),
    );

    const miner = createLiveDiscoveryMiner({
      embeddingsBackend: "openai-compatible",
      apiKey: "test-key",
      embeddingsFetchImpl: embeddingsFetch,
      signalSources: [sourceFrom("reddit", [paraphraseA])],
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });

    await miner.run({});
    expect(embeddingsFetch).toHaveBeenCalled();
  });

  it("requires an API key only for the experimental openai-compatible backend", () => {
    expect(() =>
      createLiveDiscoveryMiner({
        embeddingsBackend: "openai-compatible",
        signalSources: [sourceFrom("reddit", [paraphraseA])],
      }),
    ).toThrow(/OPENAI_API_KEY|apiKey|openai-compatible/i);
  });
});

describe("Script CLI --live", () => {
  it("wires the live discovery composition through run (local Embeddings double)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-live-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const seed = evidence({
      id: "live-seed",
      quote: "Freelancers still chase unpaid invoices in spreadsheets",
    });
    const embedBatch = vi.fn(localEmbedBatch({
      [seed.quote]: INVOICE_VEC_A,
    }));

    const code = await runCli(["--live", "--format", "json", "--out", outPath], {
      env: {},
      liveDiscovery: {
        localEmbeddings: { embedBatch },
        signalSources: [sourceFrom("reddit", [seed])],
        followOnFetcher: { async fetchPage() { return []; } },
        storeReviewSource: { async fetchReviews() { return []; } },
      },
      stdout: { write() {} },
    });

    expect(code).toBe(0);
    expect(embedBatch).toHaveBeenCalled();
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      evidence: { id: string }[];
      candidateClusters: unknown[];
    };
    expect(written.evidence.map((item) => item.id)).toEqual(["live-seed"]);
    expect(Array.isArray(written.candidateClusters)).toBe(true);
  });

  it("keeps fixture defaults without --live (no live Embeddings)", async () => {
    const embedBatch = vi.fn(localEmbedBatch({
      anything: INVOICE_VEC_A,
    }));

    const chunks: string[] = [];
    const code = await runCli(["--format", "markdown"], {
      liveDiscovery: {
        localEmbeddings: { embedBatch },
      },
      stdout: {
        write(chunk: string) {
          chunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(0);
    expect(embedBatch).not.toHaveBeenCalled();
    expect(chunks.join("")).toContain("# Pain Point Miner RunArtifact");
  });

  it("succeeds --live without OPENAI_API_KEY when local Embeddings are available", async () => {
    const seed = evidence({
      id: "no-paid-key",
      quote: "Still chasing unpaid invoices in a spreadsheet",
    });
    const embedBatch = vi.fn(localEmbedBatch({
      [seed.quote]: INVOICE_VEC_A,
    }));
    const stderrChunks: string[] = [];

    const code = await runCli(["--live", "--format", "json"], {
      env: {},
      liveDiscovery: {
        localEmbeddings: { embedBatch },
        signalSources: [sourceFrom("reddit", [seed])],
        followOnFetcher: { async fetchPage() { return []; } },
        storeReviewSource: { async fetchReviews() { return []; } },
      },
      stdout: { write() {} },
      stderr: {
        write(chunk: string) {
          stderrChunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(0);
    expect(embedBatch).toHaveBeenCalled();
    expect(stderrChunks.join("")).not.toMatch(/OPENAI_API_KEY|apiKey/i);
  });

  it("fails --live when local Embeddings are unavailable and none were injected", async () => {
    const stderrChunks: string[] = [];
    const seed = evidence({
      id: "fail-seed",
      quote: "Need something for late invoice reminders",
    });

    const code = await runCli(["--live", "--format", "json"], {
      env: {},
      liveDiscovery: {
        localEmbeddings: {
          loadExtractor: async () => {
            throw new Error("Local embedding model unavailable at cache path");
          },
        },
        signalSources: [sourceFrom("reddit", [seed])],
        followOnFetcher: { async fetchPage() { return []; } },
        storeReviewSource: { async fetchReviews() { return []; } },
      },
      stdout: { write() {} },
      stderr: {
        write(chunk: string) {
          stderrChunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(1);
    expect(stderrChunks.join("")).toMatch(/local embedding|unavailable/i);
  });
});
