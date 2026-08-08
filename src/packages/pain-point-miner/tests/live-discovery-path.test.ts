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
 * Seams under test (ticket #24):
 * - createLiveDiscoveryMiner → PainPointMiner.run — Entry Catalog + Follow-on /
 *   Store Second Pass + live Embeddings composition (no hand-assembled adapters)
 * - Script CLI `--live` — same composition; fixture defaults remain without `--live`
 * - Injectable doubles / scripted embeddings HTTP — no live network in CI
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

  it("composes Entry Catalog + Follow-on/Store + live Embeddings behind run", async () => {
    const embeddingsFetch = vi.fn(
      scriptedEmbeddingsFetch({
        [paraphraseA.quote]: INVOICE_VEC_A,
        [paraphraseB.quote]: INVOICE_VEC_B,
        [unrelated.quote]: SCHEDULE_VEC,
        "IH: still chasing invoices manually": INVOICE_VEC_A,
        "App Store: Wave reminders never fire": INVOICE_VEC_B,
      }),
    );

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
      apiKey: "test-key",
      embeddingsFetchImpl: embeddingsFetch,
      signalSources: entryCatalogSources,
      followOnFetcher,
      storeReviewSource,
    });

    const artifact = await miner.run({ countGateThreshold: 3 });

    expect(embeddingsFetch).toHaveBeenCalled();
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

  it("requires an API key when live Embeddings are not injected", () => {
    expect(() =>
      createLiveDiscoveryMiner({
        signalSources: [sourceFrom("reddit", [paraphraseA])],
      }),
    ).toThrow(/OPENAI_API_KEY|apiKey/i);
  });
});

describe("Script CLI --live", () => {
  it("wires the live discovery composition through run (injectable doubles)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-live-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const seed = evidence({
      id: "live-seed",
      quote: "Freelancers still chase unpaid invoices in spreadsheets",
    });
    const embeddingsFetch = vi.fn(
      scriptedEmbeddingsFetch({
        [seed.quote]: INVOICE_VEC_A,
      }),
    );

    const code = await runCli(["--live", "--format", "json", "--out", outPath], {
      liveDiscovery: {
        apiKey: "test-key",
        embeddingsFetchImpl: embeddingsFetch,
        signalSources: [sourceFrom("reddit", [seed])],
        followOnFetcher: { async fetchPage() { return []; } },
        storeReviewSource: { async fetchReviews() { return []; } },
      },
      stdout: { write() {} },
    });

    expect(code).toBe(0);
    expect(embeddingsFetch).toHaveBeenCalled();
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      evidence: { id: string }[];
      candidateClusters: unknown[];
    };
    expect(written.evidence.map((item) => item.id)).toEqual(["live-seed"]);
    expect(Array.isArray(written.candidateClusters)).toBe(true);
  });

  it("keeps fixture defaults without --live (no live Embeddings API)", async () => {
    const embeddingsFetch = vi.fn(
      scriptedEmbeddingsFetch({
        anything: INVOICE_VEC_A,
      }),
    );

    const chunks: string[] = [];
    const code = await runCli(["--format", "markdown"], {
      liveDiscovery: {
        apiKey: "test-key",
        embeddingsFetchImpl: embeddingsFetch,
      },
      stdout: {
        write(chunk: string) {
          chunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(0);
    expect(embeddingsFetch).not.toHaveBeenCalled();
    expect(chunks.join("")).toContain("# Pain Point Miner RunArtifact");
  });

  it("fails --live when OPENAI_API_KEY is missing", async () => {
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      const code = await runCli(["--live", "--format", "json"], {
        env: {},
        stdout: { write() {} },
      });
      expect(code).toBe(1);
      expect(stderrChunks.join("")).toMatch(/OPENAI_API_KEY|apiKey/i);
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});
