import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFixtureEmbeddings,
  createPainPointMiner,
  formatRunArtifact,
  type AnalysisOutcome,
  type AnalysisPass,
  type AnalysisPassInput,
  type Brief,
  type Embeddings,
  type EvidenceRef,
  type Intent,
  type SignalSource,
} from "../index.js";
import { createTestSignalSources, knownEvidence } from "./fixtures.js";
import { runCli } from "../cli.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const FILLED_INTENT: Intent = {
  theme: "AI automation",
  productShape: "solo-dev SaaS with a thin UI",
  constraints: "nights and weekends only; no paid ads",
  hardNos: "no marketplace, no crypto",
  successDefinition: "first paying customer within 90 days",
};

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

function sourceFrom(
  name: string,
  evidence: readonly EvidenceRef[],
  collectLog?: string[],
): SignalSource {
  return {
    name,
    async collect() {
      collectLog?.push(name);
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

function clusterOf(
  prefix: string,
  count: number,
  signalSource = "reddit",
): EvidenceRef[] {
  return Array.from({ length: count }, (_, index) =>
    evidence({
      id: `${prefix}-${index + 1}`,
      quote: `${prefix} pain quote ${index + 1}`,
      structuralKey: prefix,
      signalKind: "demand-signal",
      signalSource,
    }),
  );
}

function briefFor(clusterId: string, overrides: Partial<Brief> = {}): Brief {
  return {
    clusterId,
    painPointSummary: "A concrete pain",
    evidenceLinks: [`https://example.com/${clusterId}`],
    targetMarket: "freelancers",
    competitiveLandscape: "some tools exist",
    statusQuoSpend: "spreadsheets",
    deliveryCost: "solo-dev SaaS",
    difficulty: "M",
    competitionDensity: 0.2,
    signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
    ...overrides,
  };
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

describe("Script CLI artifact formatting", () => {
  it("emits JSON suitable for local inspection", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
      embeddings: createFixtureEmbeddings(),
    });
    const artifact = await miner.run({});

    const json = formatRunArtifact(artifact, "json");
    const parsed = JSON.parse(json) as {
      intent: unknown;
      evidence: typeof knownEvidence;
    };

    expect(parsed.intent).toEqual({});
    expect(parsed.evidence).toEqual([...knownEvidence]);
  });

  it("emits Markdown with quotable Evidence and links", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
      embeddings: createFixtureEmbeddings(),
    });
    const artifact = await miner.run({});

    const markdown = formatRunArtifact(artifact, "markdown");

    expect(markdown).toContain("# Pain Point Miner RunArtifact");
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain("## Candidate Clusters");
    expect(markdown).toContain("Count Gate");
    expect(markdown).toContain(knownEvidence[0]!.quote);
    expect(markdown).toContain(knownEvidence[0]!.url);
    expect(markdown).toContain(knownEvidence[1]!.quote);
    expect(markdown).toContain(knownEvidence[1]!.url);
  });
});

describe("Script CLI", () => {
  it("runs the same seam and writes JSON to a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(["--format", "json", "--out", outPath], {
      signalSources: createTestSignalSources(),
      stdout: { write() {} },
    });

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      evidence: { id: string }[];
    };
    expect(written.evidence.map((e) => e.id)).toEqual(
      knownEvidence.map((e) => e.id),
    );
  });

  it("prints Markdown to stdout by default", async () => {
    const chunks: string[] = [];
    const code = await runCli(["--format", "markdown"], {
      signalSources: createTestSignalSources(),
      stdout: {
        write(chunk: string) {
          chunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(0);
    const output = chunks.join("");
    expect(output).toContain("# Pain Point Miner RunArtifact");
    expect(output).toContain(knownEvidence[0]!.url);
  });

  it("emits condensed Skill handoff JSON without full scrape evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-handoff-"));
    tempDirs.push(dir);
    const outPath = join(dir, "handoff.json");

    const code = await runCli(
      ["--format", "json", "--handoff", "skill", "--out", outPath],
      {
        signalSources: createTestSignalSources(),
        stdout: { write() {} },
      },
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      intent: unknown;
      gatedClusters: unknown[];
      saturationStopped: boolean;
      sourceDegradationNotes: unknown;
      evidence?: unknown;
      candidateClusters?: unknown;
    };
    expect(written.intent).toEqual({});
    expect(Array.isArray(written.gatedClusters)).toBe(true);
    expect(typeof written.saturationStopped).toBe("boolean");
    // Fixture (non-live) handoff: no live deepenings skipped.
    expect(written.sourceDegradationNotes).toEqual([]);
    expect(written).not.toHaveProperty("evidence");
    expect(written).not.toHaveProperty("candidateClusters");
  });
});

/**
 * Seam: Script CLI argv → PainPointMiner.run(RunInput) → RunArtifact.
 * Fixture path only (injectable Signal Sources / Embeddings; no live network).
 */
describe("Script CLI RunInput wiring", () => {
  it("default CLI invocation emits empty Intent {}", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-default-intent-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(["--format", "json", "--out", outPath], {
      signalSources: createTestSignalSources(),
      stdout: { write() {} },
    });

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      intent: Intent;
      saturationStopped: boolean;
    };
    expect(written.intent).toEqual({});
    expect(written.saturationStopped).toBe(false);
  });

  it("wires optional Intent fields onto the emitted RunArtifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-intent-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(
      [
        "--format",
        "json",
        "--out",
        outPath,
        "--theme",
        FILLED_INTENT.theme!,
        "--product-shape",
        FILLED_INTENT.productShape!,
        "--constraints",
        FILLED_INTENT.constraints!,
        "--hard-nos",
        FILLED_INTENT.hardNos!,
        "--success-definition",
        FILLED_INTENT.successDefinition!,
      ],
      {
        signalSources: createTestSignalSources(),
        stdout: { write() {} },
      },
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      intent: Intent;
    };
    expect(written.intent).toEqual(FILLED_INTENT);
  });

  it("filled Intent does not change which fixture Evidence is crawled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-intent-sources-"));
    tempDirs.push(dir);
    const emptyOut = join(dir, "empty.json");
    const filledOut = join(dir, "filled.json");

    const emptyCode = await runCli(
      ["--format", "json", "--out", emptyOut],
      {
        signalSources: createTestSignalSources(),
        stdout: { write() {} },
      },
    );
    const filledCode = await runCli(
      [
        "--format",
        "json",
        "--out",
        filledOut,
        "--theme",
        FILLED_INTENT.theme!,
        "--hard-nos",
        FILLED_INTENT.hardNos!,
      ],
      {
        signalSources: createTestSignalSources(),
        stdout: { write() {} },
      },
    );

    expect(emptyCode).toBe(0);
    expect(filledCode).toBe(0);
    const emptyArtifact = JSON.parse(await readFile(emptyOut, "utf8")) as {
      evidence: { id: string }[];
    };
    const filledArtifact = JSON.parse(await readFile(filledOut, "utf8")) as {
      evidence: { id: string }[];
      intent: Intent;
    };
    expect(filledArtifact.intent).toEqual({
      theme: FILLED_INTENT.theme,
      hardNos: FILLED_INTENT.hardNos,
    });
    expect(filledArtifact.evidence.map((e) => e.id)).toEqual(
      emptyArtifact.evidence.map((e) => e.id),
    );
  });

  it("overrides Count Gate threshold when --count-gate-threshold is set", async () => {
    const thin = clusterOf("thin-gate", 4);
    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of thin) {
      quoteMap[item.quote] = PAIN_VEC;
    }

    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-count-gate-"));
    tempDirs.push(dir);
    const defaultOut = join(dir, "default.json");
    const overriddenOut = join(dir, "overridden.json");
    const io = {
      signalSources: [sourceFrom("reddit", thin)],
      embeddings: embeddingsByQuote(quoteMap),
      stdout: { write() {} },
    };

    expect(
      await runCli(["--format", "json", "--out", defaultOut], io),
    ).toBe(0);
    expect(
      await runCli(
        [
          "--format",
          "json",
          "--out",
          overriddenOut,
          "--count-gate-threshold",
          "4",
        ],
        io,
      ),
    ).toBe(0);

    const defaultArtifact = JSON.parse(await readFile(defaultOut, "utf8")) as {
      gatedClusters: unknown[];
    };
    const overridden = JSON.parse(await readFile(overriddenOut, "utf8")) as {
      gatedClusters: { evidenceCount: number }[];
    };
    expect(defaultArtifact.gatedClusters).toHaveLength(0);
    expect(overridden.gatedClusters).toHaveLength(1);
    expect(overridden.gatedClusters[0]!.evidenceCount).toBe(4);
  });

  it("overrides Saturation Stop K when --saturation-stop-k is set", async () => {
    const collectLog: string[] = [];
    const first = clusterOf("sat-a", 5, "source-a");
    const second = clusterOf("sat-b", 5, "source-b");
    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of first) {
      quoteMap[item.quote] = PAIN_VEC;
    }
    for (const item of second) {
      quoteMap[item.quote] = OTHER_VEC;
    }

    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-saturation-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(
      [
        "--format",
        "json",
        "--out",
        outPath,
        "--saturation-stop-k",
        "1",
      ],
      {
        signalSources: [
          sourceFrom("source-a", first, collectLog),
          sourceFrom("source-b", second, collectLog),
        ],
        embeddings: embeddingsByQuote(quoteMap),
        stdout: { write() {} },
      },
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      saturationStopped: boolean;
      gatedClusters: unknown[];
      evidence: { id: string }[];
    };
    expect(written.saturationStopped).toBe(true);
    expect(written.gatedClusters).toHaveLength(1);
    expect(collectLog).toEqual(["source-a"]);
    expect(written.evidence.every((e) => e.id.startsWith("sat-a-"))).toBe(true);
  });

  it("overrides Competition Filter threshold when --competition-filter-threshold is set", async () => {
    const low = clusterOf("low-comp", 5);
    const high = clusterOf("high-comp", 5);
    const quoteMap: Record<string, readonly number[]> = {};
    for (const item of low) {
      quoteMap[item.quote] = PAIN_VEC;
    }
    for (const item of high) {
      quoteMap[item.quote] = OTHER_VEC;
    }

    const analysisPass = recordingAnalysisPass((input) => {
      const isHigh = input.cluster.evidence.some((item) =>
        item.id.startsWith("high-comp-"),
      );
      return {
        status: "brief",
        brief: briefFor(input.cluster.id, {
          competitionDensity: isHigh ? 0.9 : 0.2,
          evidenceLinks: input.cluster.evidence.map((item) => item.url),
          signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
        }),
      };
    });

    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-competition-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(
      [
        "--format",
        "json",
        "--out",
        outPath,
        "--theme",
        FILLED_INTENT.theme!,
        "--competition-filter-threshold",
        "0.5",
      ],
      {
        signalSources: [sourceFrom("reddit", [...low, ...high])],
        embeddings: embeddingsByQuote(quoteMap),
        analysisPass,
        stdout: { write() {} },
      },
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      intent: Intent;
      briefs: { competitionDensity: number }[];
      visibleBriefs: { competitionDensity: number }[];
      hiddenByCompetitionFilter: { competitionDensity: number }[];
    };
    expect(written.intent).toEqual({ theme: FILLED_INTENT.theme });
    expect(analysisPass.calls).toHaveLength(2);
    for (const call of analysisPass.calls) {
      expect(call.intent).toEqual({ theme: FILLED_INTENT.theme });
    }
    expect(written.briefs).toHaveLength(2);
    expect(written.visibleBriefs).toHaveLength(1);
    expect(written.visibleBriefs[0]!.competitionDensity).toBe(0.2);
    expect(written.hiddenByCompetitionFilter).toHaveLength(1);
    expect(written.hiddenByCompetitionFilter[0]!.competitionDensity).toBe(0.9);
  });

  it("rejects non-positive Count Gate / Saturation Stop overrides", async () => {
    const err: string[] = [];
    const code = await runCli(
      ["--count-gate-threshold", "0", "--format", "json"],
      {
        signalSources: createTestSignalSources(),
        stdout: { write() {} },
        stderr: {
          write(chunk: string) {
            err.push(chunk);
            return true;
          },
        },
      },
    );
    expect(code).toBe(1);
    expect(err.join("")).toContain(
      "--count-gate-threshold requires a number greater than 0",
    );
  });
});
