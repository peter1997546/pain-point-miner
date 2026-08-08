import type { LlmClient } from "./llm-client.js";
import { asArray, asNumber, asString, isRecord } from "./parse-unknown.js";
import type {
  AnalysisOutcome,
  AnalysisPass,
  AnalysisPassInput,
  Brief,
  CandidateCluster,
  Difficulty,
  Intent,
} from "./types.js";

/**
 * System instructions for per-cluster Hollow judgment + Brief enrichment.
 * Kept as a named export so contract tests can assert required criteria
 * without coupling to prompt assembly internals.
 */
export const ANALYSIS_PASS_SYSTEM_PROMPT = `You are the Analysis Pass for Pain Point Miner.
Analyze ONE Candidate Cluster only. Do not ask for sibling clusters or the full scrape corpus.

Hollow vs Pain Point:
- Mark Hollow when complaints are wish-only with no concrete scene / workaround / observable failure, and/or interchangeable platitudes that do not point at one concrete pain.
- Otherwise emit a Brief.

Brief rules:
- Ground the Pain Point summary in this cluster's Evidence only.
- Do not invent Evidence. Quote and link only URLs already present on the cluster.
- Competitive Landscape must judge actual market fit / local penetration for the relevant Target Market. Annotate Mature Solution presence when the market is already well served. Competitor country-of-origin alone does not invent an opportunity.
- Delivery Cost is a rough build/run cost driver read (models, APIs, ops, compliance, etc.). Never invent TAM, ARR, or profit forecasts.
- difficulty must be one of S, M, L.
- competitionDensity is a 0..1 annotation for the Builder's Competition Filter — never a silent hard-kill.
- Include every Brief field with real enrichment text — do not leave fields empty.
- Intent fields (theme, productShape, constraints, hardNos, successDefinition), when present, are preference notes only — e.g. shaping Delivery Cost commentary. They must not invent crawl targets, whitelist sources, or rewrite mined Evidence.

Respond with a single JSON object and no prose outside JSON:
Hollow:
{"status":"hollow","reason":"..."}
Brief:
{"status":"brief","painPointSummary":"...","targetMarket":"...","competitiveLandscape":"...","statusQuoSpendSignals":"...","deliveryCost":"...","difficulty":"S"|"M"|"L","competitionDensity":0.0,"evidenceLinks":["https://..."]}`;

export type LlmAnalysisPassDeps = {
  llm: LlmClient;
};

/** LLM-backed Analysis Pass — same per-cluster `AnalysisPass` port (ADR-0011). */
export function createLlmAnalysisPass(
  deps: LlmAnalysisPassDeps,
): AnalysisPass {
  return {
    async analyze(input: AnalysisPassInput): Promise<AnalysisOutcome> {
      const user = buildAnalysisUserPrompt(input.cluster, input.intent);
      const raw = await deps.llm.complete({
        system: ANALYSIS_PASS_SYSTEM_PROMPT,
        user,
      });
      return parseAnalysisCompletion(raw, input.cluster);
    },
  };
}

function buildAnalysisUserPrompt(
  cluster: CandidateCluster,
  intent: Intent,
): string {
  const payload = {
    cluster: {
      id: cluster.id,
      evidenceCount: cluster.evidenceCount,
      signalMix: cluster.signalMix,
      evidence: cluster.evidence.map((item) => ({
        id: item.id,
        quote: item.quote,
        url: item.url,
        signalSource: item.signalSource,
        signalKind: item.signalKind ?? null,
      })),
    },
    intent,
  };
  return [
    "Analyze this single Candidate Cluster. Return JSON only.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseAnalysisCompletion(
  raw: string,
  cluster: CandidateCluster,
): AnalysisOutcome {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Analysis Pass LLM response was not valid JSON");
  }

  const status = asString(parsed.status);
  if (status === "hollow") {
    const reason =
      asString(parsed.reason) ??
      "Hollow: wish-only or platitude without concrete scene or workaround.";
    return {
      status: "hollow",
      clusterId: cluster.id,
      reason,
      signalMix: cluster.signalMix,
    };
  }

  if (status !== "brief") {
    throw new Error(
      `Analysis Pass LLM response has unknown status: ${String(parsed.status)}`,
    );
  }

  const brief = buildBriefFromParsed(parsed, cluster);
  return { status: "brief", brief };
}

function buildBriefFromParsed(
  parsed: Record<string, unknown>,
  cluster: CandidateCluster,
): Brief {
  const allowed = new Set(cluster.evidence.map((item) => item.url));
  const fromModel = asArray(parsed.evidenceLinks)
    ?.map((link) => asString(link))
    .filter((link): link is string => link !== undefined && allowed.has(link));
  const evidenceLinks =
    fromModel && fromModel.length > 0
      ? fromModel
      : cluster.evidence.map((item) => item.url);

  const painPointSummary = requireField(parsed, "painPointSummary");
  const targetMarket = requireField(parsed, "targetMarket");
  const competitiveLandscape = requireField(parsed, "competitiveLandscape");
  const statusQuoSpendSignals = requireField(parsed, "statusQuoSpendSignals");
  const deliveryCost = requireField(parsed, "deliveryCost");
  const difficulty = parseDifficulty(parsed.difficulty);
  const competitionDensity = parseCompetitionDensity(parsed.competitionDensity);

  return {
    clusterId: cluster.id,
    painPointSummary,
    evidenceLinks,
    targetMarket,
    competitiveLandscape,
    statusQuoSpendSignals,
    deliveryCost,
    difficulty,
    signalMix: cluster.signalMix,
    competitionDensity,
  };
}

function requireField(
  parsed: Record<string, unknown>,
  field: string,
): string {
  const value = asString(parsed[field]);
  if (!value) {
    throw new Error(
      `Analysis Pass LLM brief missing required field: ${field}`,
    );
  }
  return value;
}

function parseDifficulty(value: unknown): Difficulty {
  const text = asString(value)?.toUpperCase();
  if (text === "S" || text === "M" || text === "L") {
    return text;
  }
  throw new Error(
    `Analysis Pass LLM brief has invalid difficulty: ${String(value)}`,
  );
}

function parseCompetitionDensity(value: unknown): number {
  const number = asNumber(value);
  if (number === undefined) {
    throw new Error(
      `Analysis Pass LLM brief missing required field: competitionDensity`,
    );
  }
  return clamp01(number);
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.unshift(fenced[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (isRecord(value)) {
        return value;
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}
