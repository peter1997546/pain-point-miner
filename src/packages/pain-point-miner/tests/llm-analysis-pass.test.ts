import { describe, expect, it } from "vitest";
import {
  ANALYSIS_PASS_SYSTEM_PROMPT,
  createLlmAnalysisPass,
  createPainPointMiner,
  createSkillOrchestrator,
  type AnalysisPassInput,
  type CandidateCluster,
  type Embeddings,
  type EvidenceRef,
  type LlmClient,
  type LlmCompletionRequest,
  type SignalSource,
} from "../index.js";

/**
 * Seams under test (ticket #12 / ADR-0011 / ADR-0003):
 * - createLlmAnalysisPass({ llm }).analyze({ cluster, intent }) — LLM Analysis Pass
 * - Injectable LlmClient (scripted completions — no live LLM in CI)
 * - Same AnalysisPass port usable by createSkillOrchestrator fan-out
 * - Mining remains deterministic with doubles elsewhere; this file covers the LLM path only
 */

const PAIN_VEC = [1, 0, 0] as const;
const OTHER_VEC = [0, 1, 0] as const;

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
      quote: `${prefix} concrete workaround quote ${index + 1}: still pasting invoices into a spreadsheet every Friday night`,
      structuralKey: prefix,
      signalKind,
    }),
  );
}

function gatedCluster(
  id: string,
  items: readonly EvidenceRef[],
): CandidateCluster {
  const demandSignalCount = items.filter(
    (item) => item.signalKind === "demand-signal",
  ).length;
  const incumbentFrictionCount = items.filter(
    (item) => item.signalKind === "incumbent-friction",
  ).length;
  return {
    id,
    evidence: [...items],
    evidenceCount: items.length,
    passedCountGate: true,
    signalMix: { demandSignalCount, incumbentFrictionCount },
  };
}

function scriptedLlm(
  respond: (request: LlmCompletionRequest) => string,
): LlmClient & { readonly requests: readonly LlmCompletionRequest[] } {
  const requests: LlmCompletionRequest[] = [];
  return {
    get requests() {
      return requests;
    },
    async complete(request) {
      requests.push(request);
      return respond(request);
    },
  };
}

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

function sourceFrom(name: string, items: readonly EvidenceRef[]): SignalSource {
  return {
    name,
    async collect() {
      return items;
    },
  };
}

describe("LLM Analysis Pass (Hollow + Brief enrichment)", () => {
  it("encodes Hollow rejection, Delivery Cost, and Competitive Landscape rules in the system prompt", () => {
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/Hollow/i);
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(
      /wish-only|platitude|concrete scene|workaround/i,
    );
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/Delivery Cost/i);
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/cost driver/i);
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(
      /Never invent TAM|not.*\bTAM\b|not a TAM/i,
    );
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/Competitive Landscape/i);
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(
      /penetration|market fit|country-of-origin/i,
    );
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/Mature Solution/i);
    expect(ANALYSIS_PASS_SYSTEM_PROMPT).toMatch(/do not invent Evidence/i);
  });

  it("fails closed when a Brief response omits required enrichment fields", async () => {
    const real = gatedCluster(
      "cluster-incomplete",
      clusterOfFive("incomplete", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
      ]),
    );
    const llm = scriptedLlm(() =>
      JSON.stringify({
        status: "brief",
        painPointSummary: "Only a summary, missing the rest.",
      }),
    );

    await expect(
      createLlmAnalysisPass({ llm }).analyze({ cluster: real, intent: {} }),
    ).rejects.toThrow(/missing required field/i);
  });

  it("analyzes one Candidate Cluster at a time without stuffing sibling Evidence into the LLM call", async () => {
    const invoice = gatedCluster(
      "cluster-invoice",
      clusterOfFive("invoice", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "incumbent-friction",
        "incumbent-friction",
      ]),
    );
    const inventory = gatedCluster(
      "cluster-inventory",
      clusterOfFive("inventory", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
      ]),
    );

    const llm = scriptedLlm(() =>
      JSON.stringify({
        status: "brief",
        painPointSummary: "Freelancers chase late invoices manually every week.",
        targetMarket: "Solo freelancers in Hong Kong",
        competitiveLandscape:
          "Wave has weak local penetration for HK freelancers; spreadsheet is the status quo.",
        statusQuoSpendSignals: "Weekend chase time; some pay for Wave.",
        deliveryCost:
          "Email/SMS APIs + light scheduling jobs; modest model calls; no heavy compliance.",
        difficulty: "M",
        competitionDensity: 0.35,
        evidenceLinks: invoice.evidence.map((item) => item.url),
      }),
    );

    const filledIntent = {
      theme: "AI automation",
      productShape: "solo-dev SaaS with a thin UI",
      constraints: "nights and weekends only",
      hardNos: "no marketplace",
      successDefinition: "first paying customer within 90 days",
    };
    const analysisPass = createLlmAnalysisPass({ llm });
    const input: AnalysisPassInput = {
      cluster: invoice,
      intent: filledIntent,
    };
    const outcome = await analysisPass.analyze(input);

    expect(llm.requests).toHaveLength(1);
    const request = llm.requests[0]!;
    expect(request.system).toBe(ANALYSIS_PASS_SYSTEM_PROMPT);
    expect(request.system).toMatch(/productShape|preference notes/i);
    expect(request.user).toContain(invoice.id);
    for (const item of invoice.evidence) {
      expect(request.user).toContain(item.id);
      expect(request.user).toContain(item.url);
    }
    // Sibling gated cluster must not appear in this LLM call.
    expect(request.user).not.toContain(inventory.id);
    for (const item of inventory.evidence) {
      expect(request.user).not.toContain(item.id);
      expect(request.user).not.toContain(item.url);
    }
    expect(request.user).not.toMatch(/full scrape|allClusters|corpus/i);
    // Preference notes reach the Analysis Pass user payload.
    expect(request.user).toContain("AI automation");
    expect(request.user).toContain("solo-dev SaaS with a thin UI");
    expect(request.user).toContain("nights and weekends only");
    expect(request.user).toContain("no marketplace");
    expect(request.user).toContain("first paying customer within 90 days");

    expect(outcome.status).toBe("brief");
    if (outcome.status !== "brief") {
      throw new Error("expected brief");
    }
    expect(outcome.brief.clusterId).toBe(invoice.id);
    expect(outcome.brief.signalMix).toEqual(invoice.signalMix);
  });

  it("rejects Hollow clusters when the LLM judges wish-only / platitude without concrete scene", async () => {
    const hollow = gatedCluster(
      "cluster-hollow",
      clusterOfFive("hollow", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
      ]).map((item, index) =>
        evidence({
          ...item,
          quote: `I wish there was a better tool somehow ${index + 1}`,
        }),
      ),
    );

    const llm = scriptedLlm(() =>
      JSON.stringify({
        status: "hollow",
        reason:
          "Wish-only platitudes with no concrete scene, workaround, or observable failure.",
      }),
    );

    const outcome = await createLlmAnalysisPass({ llm }).analyze({
      cluster: hollow,
      intent: {},
    });

    expect(outcome).toEqual({
      status: "hollow",
      clusterId: hollow.id,
      reason:
        "Wish-only platitudes with no concrete scene, workaround, or observable failure.",
      signalMix: hollow.signalMix,
    });
  });

  it("emits Brief enrichment fields and drops invented Evidence links", async () => {
    const real = gatedCluster(
      "cluster-real",
      clusterOfFive("real", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "incumbent-friction",
        "incumbent-friction",
      ]),
    );
    const allowedUrls = real.evidence.map((item) => item.url);
    const invented = "https://invented.example/not-from-cluster";

    const llm = scriptedLlm(() =>
      JSON.stringify({
        status: "brief",
        painPointSummary:
          "Bookkeepers lose Friday nights reconciling late client invoices by hand.",
        targetMarket: "Freelance bookkeepers in Hong Kong",
        competitiveLandscape:
          "Local bookkeeping SaaS has moderate penetration; Stripe-class billing tools exist but reminder workflows are weak for this locale — country of origin alone is not the opportunity.",
        statusQuoSpendSignals:
          "Spreadsheet + weekend chase time; some already pay for Wave.",
        deliveryCost:
          "Model calls for reminder drafting, email/SMS APIs, light ops.",
        difficulty: "M",
        competitionDensity: 0.4,
        evidenceLinks: [...allowedUrls.slice(0, 2), invented],
      }),
    );

    const outcome = await createLlmAnalysisPass({ llm }).analyze({
      cluster: real,
      intent: {},
    });

    expect(outcome.status).toBe("brief");
    if (outcome.status !== "brief") {
      throw new Error("expected brief");
    }

    expect(outcome.brief.painPointSummary).toContain("Bookkeepers");
    expect(outcome.brief.targetMarket).toContain("Hong Kong");
    expect(outcome.brief.competitiveLandscape).toMatch(/penetration/i);
    expect(outcome.brief.statusQuoSpendSignals.length).toBeGreaterThan(0);
    expect(outcome.brief.deliveryCost).toMatch(/API|ops|Model|cost/i);
    expect(outcome.brief.deliveryCost).toBe(
      "Model calls for reminder drafting, email/SMS APIs, light ops.",
    );
    expect(outcome.brief.difficulty).toBe("M");
    expect(outcome.brief.competitionDensity).toBe(0.4);
    expect(outcome.brief.signalMix).toEqual({
      demandSignalCount: 3,
      incumbentFrictionCount: 2,
    });
    expect(outcome.brief.evidenceLinks).toEqual(allowedUrls.slice(0, 2));
    expect(outcome.brief.evidenceLinks).not.toContain(invented);
    for (const link of outcome.brief.evidenceLinks) {
      expect(allowedUrls).toContain(link);
    }
  });

  it("falls back to cluster Evidence URLs when the LLM omits valid evidenceLinks", async () => {
    const real = gatedCluster(
      "cluster-fallback",
      clusterOfFive("fallback", [
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
        "demand-signal",
      ]),
    );

    const llm = scriptedLlm(() =>
      JSON.stringify({
        status: "brief",
        painPointSummary: "Concrete scene: chasing payments after every client call.",
        targetMarket: "US freelancers",
        competitiveLandscape: "Mature invoicing tools with strong US penetration.",
        statusQuoSpendSignals: "Hours of manual follow-up each week.",
        deliveryCost: "Scheduling + email APIs; light ops.",
        difficulty: "S",
        competitionDensity: 0.7,
        evidenceLinks: ["https://invented.example/a", "https://invented.example/b"],
      }),
    );

    const outcome = await createLlmAnalysisPass({ llm }).analyze({
      cluster: real,
      intent: {},
    });

    expect(outcome.status).toBe("brief");
    if (outcome.status !== "brief") {
      throw new Error("expected brief");
    }
    expect(outcome.brief.evidenceLinks).toEqual(
      real.evidence.map((item) => item.url),
    );
  });

  it("smoke: Skill fan-out can use LLM Analysis Pass without stuffing the full scrape into one call", async () => {
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

    const llm = scriptedLlm((request) => {
      if (request.user.includes("alpha-1")) {
        return JSON.stringify({
          status: "hollow",
          reason: "Wish-only platitudes with no concrete scene.",
        });
      }
      return JSON.stringify({
        status: "brief",
        painPointSummary: "Builders need evidence-grounded Pain Points.",
        targetMarket: "Indie builders",
        competitiveLandscape: "Idea generators are dense; evidence-grounded miners are not.",
        statusQuoSpendSignals: "Manual forum reading time.",
        deliveryCost: "Crawl adapters + embeddings API + light ops.",
        difficulty: "M",
        competitionDensity: 0.25,
      });
    });

    const scriptMiner = createPainPointMiner({
      signalSources: [sourceFrom("fixture", [...alpha, ...beta])],
      embeddings: embeddingsByQuote(quoteMap),
    });

    const skill = createSkillOrchestrator({
      runMining: (input) => scriptMiner.run(input),
      analysisPass: createLlmAnalysisPass({ llm }),
    });

    const artifact = await skill.run({});

    expect(artifact.gatedClusters).toHaveLength(2);
    expect(llm.requests).toHaveLength(2);
    expect(artifact.hollowRejections).toHaveLength(1);
    expect(artifact.briefs).toHaveLength(1);
    expect(artifact.briefs[0]?.evidenceLinks.length).toBe(5);

    for (const request of llm.requests) {
      const alphaIds = request.user.match(/"id": "alpha-\d+"/g) ?? [];
      const betaIds = request.user.match(/"id": "beta-\d+"/g) ?? [];
      // Each completion sees one cluster's Evidence ids, not both.
      expect(alphaIds.length === 0 || betaIds.length === 0).toBe(true);
      expect(alphaIds.length + betaIds.length).toBe(5);
    }
  });
});
