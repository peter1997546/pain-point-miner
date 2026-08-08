/**
 * Seam under test: Skill orchestrator `createSkillOrchestrator().run`
 *
 * The Skill calls the Script / `run` mining path for condensed gated
 * candidates, then fans out Analysis Pass one Candidate Cluster at a time
 * (ADR-0009 / ADR-0011). Tests assert that contract — not crawl internals.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createPainPointMiner,
  createSkillOrchestrator,
  type AnalysisOutcome,
  type AnalysisPass,
  type AnalysisPassInput,
  type Brief,
  type Embeddings,
  type EvidenceRef,
  type RunArtifact,
  type RunInput,
  type SignalSource,
} from "../index.js";

const PAIN_VEC = [1, 0, 0] as const;
const OTHER_VEC = [0, 1, 0] as const;

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

describe("Skill orchestrator — Script mining + per-cluster Analysis fan-out", () => {
  it("calls the Script mining path then fans out Analysis Pass per gated cluster (never full scrape)", async () => {
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

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...invoice, ...inventory]) {
      quoteMap[item.quote] =
        item.structuralKey === "inventory" ? OTHER_VEC : PAIN_VEC;
    }

    // Script mining path: PainPointMiner.run without Analysis Pass.
    const scriptMiner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...invoice, ...inventory])],
      embeddings: embeddingsByQuote(quoteMap),
    });
    const runMining = vi.fn(async (input?: RunInput) => scriptMiner.run(input));

    const analysisPass = recordingAnalysisPass((input) => ({
      status: "brief",
      brief: briefFor(input.cluster.id, {
        evidenceLinks: input.cluster.evidence.map((item) => item.url),
        signalMix: input.cluster.signalMix,
      }),
    }));

    const skill = createSkillOrchestrator({
      runMining,
      analysisPass,
    });

    const artifact = await skill.run({ intent: { theme: "AI automation" } });

    // Skill entrypoint calls Script / run mining — does not re-crawl in chat.
    expect(runMining).toHaveBeenCalledTimes(1);
    expect(runMining).toHaveBeenCalledWith({ intent: { theme: "AI automation" } });

    expect(artifact.gatedClusters).toHaveLength(2);
    expect(analysisPass.calls).toHaveLength(2);

    for (const call of analysisPass.calls) {
      expect(Object.keys(call).sort()).toEqual(["cluster", "intent"]);
      expect(call.intent).toEqual({ theme: "AI automation" });
      expect(call.cluster.evidenceCount).toBe(5);
      expect(call.cluster.passedCountGate).toBe(true);
      // Full scrape corpus / sibling clusters are not passed into one analysis step.
      expect(call).not.toHaveProperty("corpus");
      expect(call).not.toHaveProperty("allClusters");
      expect(call).not.toHaveProperty("evidence");
      expect(call.cluster.evidence).toHaveLength(5);
    }

    const calledIds = analysisPass.calls.map((call) => call.cluster.id).sort();
    const gatedIds = artifact.gatedClusters.map((cluster) => cluster.id).sort();
    expect(calledIds).toEqual(gatedIds);

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

    expect(artifact.briefs).toHaveLength(2);
    expect(artifact.visibleBriefs).toHaveLength(2);
    expect(artifact.hollowRejections).toHaveLength(0);
  });

  it("smoke: fixture Script mining + test-double Analysis Pass yields Briefs end-to-end", async () => {
    const alpha = clusterOfFive("alpha", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);
    const beta = clusterOfFive("beta", [
      "demand-signal",
      "demand-signal",
      "incumbent-friction",
      "incumbent-friction",
      "incumbent-friction",
    ]);

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...alpha, ...beta]) {
      quoteMap[item.quote] =
        item.structuralKey === "beta" ? OTHER_VEC : PAIN_VEC;
    }

    const analysisPass = recordingAnalysisPass((input) => {
      if (input.cluster.evidenceCount < 5) {
        throw new Error("ungated cluster must not reach Analysis Pass");
      }
      // Hollow one cluster by Evidence identity — works under parallel fan-out.
      if (input.cluster.evidence.some((item) => item.id.startsWith("alpha-"))) {
        return {
          status: "hollow",
          clusterId: input.cluster.id,
          reason: "Wish-only platitudes with no concrete scene.",
          signalMix: input.cluster.signalMix,
        };
      }
      return {
        status: "brief",
        brief: briefFor(input.cluster.id, {
          painPointSummary: "Builders need evidence-grounded Pain Points, not recycled ideas.",
          evidenceLinks: input.cluster.evidence.map((item) => item.url),
          signalMix: input.cluster.signalMix,
          competitionDensity: 0.3,
        }),
      };
    });

    // Script mining path with injectable fixture Signal Sources (no live network).
    const scriptMiner = createPainPointMiner({
      signalSources: [sourceFrom("fixture", [...alpha, ...beta])],
      embeddings: embeddingsByQuote(quoteMap),
    });

    const skill = createSkillOrchestrator({
      runMining: (input) => scriptMiner.run(input),
      analysisPass,
    });

    const artifact: RunArtifact = await skill.run({});

    expect(artifact.gatedClusters).toHaveLength(2);
    expect(analysisPass.calls).toHaveLength(2);
    expect(artifact.analysisOutcomes).toHaveLength(2);
    expect(artifact.hollowRejections).toHaveLength(1);
    expect(artifact.briefs).toHaveLength(1);
    expect(artifact.briefs[0]?.painPointSummary).toContain("evidence-grounded");
    // Mining Evidence remains on the artifact for inspection, but Analysis
    // Pass never received the full scrape as one argument.
    expect(artifact.evidence).toHaveLength(10);
    for (const call of analysisPass.calls) {
      expect(call.cluster.evidence).toHaveLength(5);
      expect(call.cluster.evidence.length).toBeLessThan(artifact.evidence.length);
    }
  });

  it("fans out Analysis Pass in parallel across gated clusters", async () => {
    const alpha = clusterOfFive("alpha", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);
    const beta = clusterOfFive("beta", [
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
      "demand-signal",
    ]);

    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of [...alpha, ...beta]) {
      quoteMap[item.quote] =
        item.structuralKey === "beta" ? OTHER_VEC : PAIN_VEC;
    }

    let inFlight = 0;
    let maxInFlight = 0;
    const release: Array<() => void> = [];

    const analysisPass: AnalysisPass = {
      async analyze(input) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          release.push(resolve);
          if (release.length === 2) {
            for (const done of release) {
              done();
            }
          }
        });
        inFlight -= 1;
        return {
          status: "brief",
          brief: briefFor(input.cluster.id),
        };
      },
    };

    const scriptMiner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [...alpha, ...beta])],
      embeddings: embeddingsByQuote(quoteMap),
    });

    const skill = createSkillOrchestrator({
      runMining: (input) => scriptMiner.run(input),
      analysisPass,
    });

    const artifact = await skill.run({});
    expect(artifact.briefs).toHaveLength(2);
    expect(maxInFlight).toBe(2);
  });
});
