import { describe, expect, it } from "vitest";
import {
  applyCompetitionFilter,
  createPainPointMiner,
  type AnalysisOutcome,
  type AnalysisPass,
  type AnalysisPassInput,
  type Brief,
  type Embeddings,
  type EvidenceRef,
  type SignalSource,
} from "../index.js";

const PAIN_VEC = [1, 0, 0] as const;
const OTHER_VEC = [0, 1, 0] as const;
const THIN_VEC = [0, 0, 1] as const;

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
    Partial<Pick<EvidenceRef, "url" | "signalSource">>,
): EvidenceRef {
  return {
    url: partial.url ?? `https://example.com/${partial.id}`,
    signalSource: partial.signalSource ?? "reddit",
    ...partial,
  };
}

function clusterOfFive(
  prefix: string,
  signalKinds: readonly ("demand-signal" | "incumbent-friction")[],
): EvidenceRef[] {
  return signalKinds.map((signalKind, index) =>
    evidence({
      id: `${prefix}-${index + 1}`,
      quote: `${prefix} pain quote ${index + 1}`,
      structuralKey: prefix,
      signalKind,
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

function briefFor(
  clusterId: string,
  overrides: Partial<Brief> = {},
): Brief {
  return {
    clusterId,
    painPointSummary: `Summary for ${clusterId}`,
    evidenceLinks: [`https://example.com/${clusterId}`],
    targetMarket: "Freelance bookkeepers in Hong Kong",
    competitiveLandscape:
      "Local bookkeeping SaaS with moderate penetration; Wave present but weak reminders.",
    statusQuoSpendSignals: "Spreadsheet + weekend chase time; some pay for Wave.",
    deliveryCost: "Model calls for reminder drafting; light ops; no heavy compliance.",
    difficulty: "M",
    signalMix: { demandSignalCount: 3, incumbentFrictionCount: 2 },
    competitionDensity: 0.4,
    ...overrides,
  };
}

describe("PainPointMiner.run — Analysis Pass, Signal Mix, Competition Filter", () => {
  it("invokes Analysis Pass once per gated cluster with that cluster only (never full scrape)", async () => {
    const invoice = clusterOfFive("invoice", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "incumbent-friction",
      "incumbent-friction",
    ]);
    const inventory = clusterOfFive("inventory", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);
    // Below Count Gate — must not enter Analysis Pass.
    const thin = [
      evidence({
        id: "thin-1",
        quote: "thin rant one",
        structuralKey: "thin",
        signalKind: "demand-signal",
      }),
    ];

    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id, {
        evidenceLinks: input.cluster.evidence.map((item) => item.url),
        signalMix: {
          demandSignalCount: input.cluster.evidence.filter(
            (item) => item.signalKind === "demand-signal",
          ).length,
          incumbentFrictionCount: input.cluster.evidence.filter(
            (item) => item.signalKind === "incumbent-friction",
          ).length,
        },
      }),
    }));

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...invoice, ...inventory, ...thin]) {
      if (item.structuralKey === "inventory") {
        quoteMap[item.quote] = OTHER_VEC;
      } else if (item.structuralKey === "thin") {
        quoteMap[item.quote] = THIN_VEC;
      } else {
        quoteMap[item.quote] = PAIN_VEC;
      }
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...invoice, ...inventory, ...thin])],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({});

    expect(artifact.gatedClusters).toHaveLength(2);
    expect(analysisPass.calls).toHaveLength(2);

    for (const call of analysisPass.calls) {
      expect(Object.keys(call).sort()).toEqual(["cluster", "intent"]);
      expect(call.intent).toEqual({});
      expect(call.cluster.evidenceCount).toBe(5);
      expect(call.cluster.passedCountGate).toBe(true);
      expect(call.cluster.evidence).toHaveLength(5);
      // One cluster per call — caller never receives sibling gated clusters.
      expect(call).not.toHaveProperty("corpus");
      expect(call).not.toHaveProperty("allClusters");
      expect(call).not.toHaveProperty("evidence");
    }

    const calledIds = analysisPass.calls.map((call) => call.cluster.id).sort();
    const gatedIds = artifact.gatedClusters.map((cluster) => cluster.id).sort();
    expect(calledIds).toEqual(gatedIds);

    // Each call's Evidence ids belong only to that cluster.
    for (const call of analysisPass.calls) {
      const gated = artifact.gatedClusters.find((c) => c.id === call.cluster.id);
      expect(gated).toBeDefined();
      expect(call.cluster.evidence.map((e) => e.id).sort()).toEqual(
        gated!.evidence.map((e) => e.id).sort(),
      );
      const siblingIds = artifact.gatedClusters
        .filter((c) => c.id !== call.cluster.id)
        .flatMap((c) => c.evidence.map((e) => e.id));
      for (const id of call.cluster.evidence.map((e) => e.id)) {
        expect(siblingIds).not.toContain(id);
      }
    }
  });

  it("rejects Hollow clusters from Pain Point Briefs while keeping survivors with Brief fields + Signal Mix", async () => {
    const real = clusterOfFive("real", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);
    const hollow = clusterOfFive("hollow", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);

    const analysisPass = recordingAnalysisPass((input) => {
      if (input.cluster.evidence.some((item) => item.id.startsWith("hollow-"))) {
        return {
          status: "hollow",
          clusterId: input.cluster.id,
          reason: "Wish-only platitudes with no concrete scene or workaround.",
          signalMix: {
            demandSignalCount: 5,
            incumbentFrictionCount: 0,
          },
        };
      }
      return {
        status: "brief",
        brief: briefFor(input.cluster.id, {
          painPointSummary: "Freelancers lack reliable late-payment chase automation.",
          evidenceLinks: input.cluster.evidence.map((item) => item.url),
          targetMarket: "Solo freelancers in US/UK",
          competitiveLandscape: "Wave and spreadsheets; limited local penetration elsewhere.",
          statusQuoSpendSignals: "Hours each Friday chasing invoices manually.",
          deliveryCost: "Email/SMS APIs + light scheduling; modest run cost.",
          difficulty: "S",
          signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
          competitionDensity: 0.2,
        }),
      };
    });

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...real, ...hollow]) {
      quoteMap[item.quote] =
        item.structuralKey === "hollow" ? OTHER_VEC : PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...real, ...hollow])],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({});

    expect(artifact.briefs).toHaveLength(1);
    expect(artifact.briefs[0]?.painPointSummary).toBe(
      "Freelancers lack reliable late-payment chase automation.",
    );
    expect(artifact.briefs[0]?.evidenceLinks.length).toBe(5);
    expect(artifact.briefs[0]?.targetMarket).toBe("Solo freelancers in US/UK");
    expect(artifact.briefs[0]?.competitiveLandscape.length).toBeGreaterThan(0);
    expect(artifact.briefs[0]?.statusQuoSpendSignals.length).toBeGreaterThan(0);
    expect(artifact.briefs[0]?.deliveryCost.length).toBeGreaterThan(0);
    expect(artifact.briefs[0]?.difficulty).toBe("S");
    expect(artifact.briefs[0]?.signalMix).toEqual({
      demandSignalCount: 5,
      incumbentFrictionCount: 0,
    });

    expect(artifact.hollowRejections).toHaveLength(1);
    expect(artifact.hollowRejections[0]?.reason).toMatch(/Wish-only/);
    expect(artifact.briefs.map((b) => b.clusterId)).not.toContain(
      artifact.hollowRejections[0]?.clusterId,
    );

    // Default: Competition Filter does not silently drop annotated Briefs.
    expect(artifact.visibleBriefs).toEqual(artifact.briefs);
    expect(artifact.hiddenByCompetitionFilter).toEqual([]);
  });

  it("counts Demand Signal and Incumbent Friction toward Evidence Count with visible Signal Mix", async () => {
    const mixed = clusterOfFive("mixed", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "incumbent-friction",
      "incumbent-friction",
    ]);

    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id, {
        evidenceLinks: input.cluster.evidence.map((item) => item.url),
        signalMix: {
          demandSignalCount: 3,
          incumbentFrictionCount: 2,
        },
      }),
    }));

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of mixed) {
      quoteMap[item.quote] = PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", mixed)],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({});

    expect(artifact.gatedClusters).toHaveLength(1);
    expect(artifact.gatedClusters[0]?.evidenceCount).toBe(5);
    expect(artifact.gatedClusters[0]?.signalMix).toEqual({
      demandSignalCount: 3,
      incumbentFrictionCount: 2,
    });
    expect(artifact.briefs[0]?.signalMix).toEqual({
      demandSignalCount: 3,
      incumbentFrictionCount: 2,
    });
  });

  it("applies Competition Filter post-hoc without deleting underlying annotated Briefs", async () => {
    const low = clusterOfFive("low-comp", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);
    const high = clusterOfFive("high-comp", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);

    const analysisPass = recordingAnalysisPass((input) => {
      const isHigh = input.cluster.evidence.some((item) =>
        item.id.startsWith("high-comp-"),
      );
      return {
        status: "brief",
        brief: briefFor(input.cluster.id, {
          painPointSummary: isHigh ? "High competition pain" : "Low competition pain",
          evidenceLinks: input.cluster.evidence.map((item) => item.url),
          competitionDensity: isHigh ? 0.9 : 0.2,
          signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
        }),
      };
    });

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...low, ...high]) {
      quoteMap[item.quote] =
        item.structuralKey === "high-comp" ? OTHER_VEC : PAIN_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...low, ...high])],
      embeddings: embeddingsByQuote(quoteMap),
      analysisPass,
    });

    const artifact = await miner.run({ competitionFilterThreshold: 0.5 });

    expect(artifact.briefs).toHaveLength(2);
    expect(artifact.briefs.map((b) => b.competitionDensity).sort()).toEqual([
      0.2, 0.9,
    ]);
    expect(artifact.visibleBriefs).toHaveLength(1);
    expect(artifact.visibleBriefs[0]?.competitionDensity).toBe(0.2);
    expect(artifact.hiddenByCompetitionFilter).toHaveLength(1);
    expect(artifact.hiddenByCompetitionFilter[0]?.competitionDensity).toBe(0.9);

    // Pure helper can re-show high-competition Briefs from the full annotated set.
    const shownAgain = applyCompetitionFilter(artifact.briefs, undefined);
    expect(shownAgain.visible).toHaveLength(2);
    expect(shownAgain.hidden).toHaveLength(0);

    const hideStricter = applyCompetitionFilter(artifact.briefs, 0.15);
    expect(hideStricter.visible).toHaveLength(0);
    expect(hideStricter.hidden).toHaveLength(2);
  });
});
