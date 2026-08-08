import { describe, expect, it } from "vitest";
import {
  createPainPointMiner,
  type AnalysisOutcome,
  type AnalysisPass,
  type AnalysisPassInput,
  type Brief,
  type Embeddings,
  type EvidenceRef,
  type Intent,
  type SignalSource,
} from "../index.js";

const PAIN_VEC = [1, 0, 0] as const;

/** Filled Intent preference notes (Theme + optional Analysis Pass steers). */
const FILLED_INTENT: Intent = {
  theme: "AI automation",
  productShape: "solo-dev SaaS with a thin UI",
  constraints: "nights and weekends only; no paid ads",
  hardNos: "no marketplace, no crypto",
  successDefinition: "first paying customer within 90 days",
};

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

function sourceFrom(
  name: string,
  evidence: readonly EvidenceRef[],
  collectLog: string[],
): SignalSource {
  return {
    name,
    async collect() {
      collectLog.push(name);
      return evidence;
    },
  };
}

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

function clusterOfFive(prefix: string): EvidenceRef[] {
  return Array.from({ length: 5 }, (_, index) =>
    evidence({
      id: `${prefix}-${index + 1}`,
      quote: `${prefix} pain quote ${index + 1}`,
      structuralKey: prefix,
      signalKind: "demand-signal",
    }),
  );
}

function recordingAnalysisPass(
  decide: (input: AnalysisPassInput) => AnalysisOutcome,
): AnalysisPass & { calls: AnalysisPassInput[] } {
  const calls: AnalysisPassInput[] = [];
  return {
    calls,
    async analyze(input) {
      calls.push(input);
      return decide(input);
    },
  };
}

function briefFor(clusterId: string): Brief {
  return {
    clusterId,
    painPointSummary: `Summary for ${clusterId}`,
    evidenceLinks: [`https://example.com/${clusterId}`],
    targetMarket: "Freelance bookkeepers",
    competitiveLandscape: "Spreadsheets and light SaaS.",
    statusQuoSpendSignals: "Weekend chase time.",
    deliveryCost: "Model calls for drafting; light ops.",
    difficulty: "M",
    signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
    competitionDensity: 0.3,
  };
}

describe("PainPointMiner.run — optional Intent preference fields", () => {
  it("still mines with empty Intent when Analysis Pass is present", async () => {
    const invoice = clusterOfFive("invoice");
    const collectLog: string[] = [];
    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id),
    }));

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of invoice) {
      quoteMap[item.quote] = PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [
        sourceFrom("reddit", invoice, collectLog),
        sourceFrom("hacker-news", [], collectLog),
      ],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({});

    expect(artifact.intent).toEqual({});
    expect(collectLog).toEqual(["reddit", "hacker-news"]);
    expect(artifact.evidence.map((item) => item.id)).toEqual(
      invoice.map((item) => item.id),
    );
    expect(analysisPass.calls).toHaveLength(1);
    expect(analysisPass.calls[0]?.intent).toEqual({});
  });

  it("forwards filled Intent preference notes to Analysis Pass without restricting Signal Sources", async () => {
    const invoice = clusterOfFive("invoice");
    const hnExtra = [
      evidence({
        id: "hn-wish-1",
        quote: "Ask HN: is there a tool for chasing late invoices?",
        signalSource: "hacker-news",
        structuralKey: "invoice",
        signalKind: "demand-signal",
      }),
    ];
    const collectLog: string[] = [];
    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id),
    }));

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...invoice, ...hnExtra]) {
      quoteMap[item.quote] = PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [
        sourceFrom("reddit", invoice, collectLog),
        sourceFrom("hacker-news", hnExtra, collectLog),
      ],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({ intent: FILLED_INTENT });

    expect(artifact.intent).toEqual(FILLED_INTENT);
    // Every configured Signal Source still runs — Intent is not a whitelist.
    expect(collectLog).toEqual(["reddit", "hacker-news"]);
    expect(artifact.evidence.map((item) => item.id).sort()).toEqual(
      [...invoice, ...hnExtra].map((item) => item.id).sort(),
    );

    expect(analysisPass.calls).toHaveLength(1);
    expect(analysisPass.calls[0]?.intent).toEqual(FILLED_INTENT);
  });

  it("does not invent Follow-on crawl targets from filled Intent preference fields", async () => {
    const invoice = clusterOfFive("invoice");
    const fetchedUrls: string[] = [];
    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id),
    }));

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of invoice) {
      quoteMap[item.quote] = PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [
        {
          name: "reddit",
          async collect() {
            return invoice;
          },
        },
      ],
      embeddings: embeddingsByQuote(quoteMap),
      followOnFetcher: {
        async fetchPage(url) {
          fetchedUrls.push(url);
          return [];
        },
      },
      analysisPass,
    });

    await miner.run({ intent: FILLED_INTENT });

    // Evidence has no followOnTargets — Intent must not invent crawl URLs.
    expect(fetchedUrls).toEqual([]);
    expect(analysisPass.calls[0]?.intent).toEqual(FILLED_INTENT);
  });
});
