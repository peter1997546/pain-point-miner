import { describe, expect, it } from "vitest";
import {
  createFixtureEmbeddings,
  createOpenAiCompatibleEmbeddings,
  createPainPointMiner,
  type EvidenceRef,
  type SignalSource,
} from "../index.js";

/**
 * Seams under test (ticket #21 / ADR-0005):
 * - createOpenAiCompatibleEmbeddings — live Embeddings adapter on the existing port
 * - Injectable fetchImpl (scripted / recorded responses — no live network in CI)
 * - PainPointMiner.run — grouping expectations on the artifact (not crawler / prompt internals)
 * - createFixtureEmbeddings remains the offline / deterministic Script default
 */

const INVOICE_VEC = [1, 0, 0] as const;
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

function clusterIdByEvidence(
  clusters: readonly { id: string; evidence: readonly EvidenceRef[] }[],
): Map<string, string> {
  const byId = new Map<string, string>();
  for (const cluster of clusters) {
    for (const item of cluster.evidence) {
      byId.set(item.id, cluster.id);
    }
  }
  return byId;
}

/** OpenAI embeddings–shaped recording keyed by input text. */
function scriptedEmbeddingsFetch(
  vectorsByText: Record<string, readonly number[]>,
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-key");
    expect(headers.get("Content-Type")).toBe("application/json");

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      input: string[];
    };
    expect(body.model).toBe("text-embedding-3-small");
    expect(Array.isArray(body.input)).toBe(true);

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

describe("Live Embeddings adapter (OpenAI-compatible)", () => {
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

  it("fixture Embeddings still drive deterministic offline mining via run", async () => {
    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [paraphraseA, unrelated])],
      embeddings: createFixtureEmbeddings(),
    });

    const first = await miner.run({});
    const second = await miner.run({});

    expect(first.evidence.map((item) => item.id)).toEqual(["inv-a", "sched"]);
    expect(first.candidateClusters).toEqual(second.candidateClusters);
    expect(first.gatedClusters).toEqual([]);
  });

  it("groups paraphrase Evidence into one Candidate Cluster via scripted live Embeddings", async () => {
    const embeddings = createOpenAiCompatibleEmbeddings({
      apiKey: "test-key",
      fetchImpl: scriptedEmbeddingsFetch({
        [paraphraseA.quote]: INVOICE_VEC,
        [paraphraseB.quote]: INVOICE_VEC,
        [unrelated.quote]: SCHEDULE_VEC,
      }),
    });

    const miner = createPainPointMiner({
      signalSources: [
        sourceFrom("reddit", [paraphraseA, paraphraseB, unrelated]),
      ],
      embeddings,
    });

    const artifact = await miner.run({});
    const byId = clusterIdByEvidence(artifact.candidateClusters);

    expect(byId.get("inv-a")).toBe(byId.get("inv-b"));
    expect(byId.get("inv-a")).not.toBe(byId.get("sched"));
    expect(artifact.candidateClusters).toHaveLength(2);
  });

  it("orders embedding vectors by response index when the API returns shuffled data", async () => {
    const texts = ["alpha meaning", "beta meaning"] as const;
    const embeddings = createOpenAiCompatibleEmbeddings({
      apiKey: "test-key",
      model: "text-embedding-3-small",
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        expect(body.input).toEqual([...texts]);
        // Deliberately reverse order vs request; index fields must win.
        return new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: [0, 1] },
              { index: 0, embedding: [1, 0] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await expect(embeddings.embed(texts)).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("returns an empty list without calling the network for empty input", async () => {
    let called = false;
    const embeddings = createOpenAiCompatibleEmbeddings({
      apiKey: "test-key",
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 500 });
      },
    });

    await expect(embeddings.embed([])).resolves.toEqual([]);
    expect(called).toBe(false);
  });
});
