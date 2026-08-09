/**
 * Seams under test (ticket #38 / Seam B / ADR-0013–0015):
 * - liveSourceDegradationNotes — token-gated skips available for the Run Report
 * - assembleRunReport / writeSkillRunFolder — Report Agent integrates Analysis
 *   outcomes into a time-based run folder (handoff.json + report.md via formatter)
 * - CLI `--live --handoff skill` carries degradation notes on the Skill handoff
 *
 * Product Analysis Pass is Cursor agents — not createLlmAnalysisPass.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import {
  assembleRunReport,
  createSkillRunFolderPath,
  liveSourceDegradationNotes,
  prepareSkillRunFolder,
  toSkillMiningHandoff,
  writeSkillRunFolder,
  type AnalysisOutcome,
  type Brief,
  type CandidateCluster,
  type EvidenceRef,
  type SkillMiningHandoff,
} from "../index.js";
import { access } from "node:fs/promises";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

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

function gatedCluster(overrides: Partial<CandidateCluster> = {}): CandidateCluster {
  const items = [
    evidence({
      id: "inv-1",
      quote: "I chase unpaid invoices in a spreadsheet every Friday",
      signalKind: "demand-signal",
    }),
    evidence({
      id: "inv-2",
      quote: "Still hunting clients for money they owe",
      signalKind: "demand-signal",
    }),
  ];
  return {
    id: "cluster-invoice",
    evidence: items,
    evidenceCount: items.length,
    passedCountGate: true,
    signalMix: { demandSignalCount: 2, incumbentFrictionCount: 0 },
    ...overrides,
  };
}

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    clusterId: "cluster-invoice",
    painPointSummary:
      "Freelancers lose Fridays chasing late invoices in spreadsheets.",
    evidenceLinks: ["https://example.com/inv-1"],
    targetMarket: "Freelance bookkeepers in Hong Kong",
    competitiveLandscape: "Local bookkeeping SaaS; weak reminder workflows.",
    statusQuoSpendSignals: "Spreadsheet + weekend chase time.",
    deliveryCost: "Model calls for reminder drafting; light ops.",
    difficulty: "M",
    signalMix: { demandSignalCount: 2, incumbentFrictionCount: 0 },
    competitionDensity: 0.35,
    ...overrides,
  };
}

function handoff(
  overrides: Partial<SkillMiningHandoff> = {},
): SkillMiningHandoff {
  return {
    intent: { theme: "AI automation" },
    gatedClusters: [gatedCluster()],
    saturationStopped: false,
    sourceDegradationNotes: [],
    ...overrides,
  };
}

describe("liveSourceDegradationNotes — token-gated skips for Run Report", () => {
  it("notes Product Hunt Follow-on skip when access token is unset", () => {
    const notes = liveSourceDegradationNotes({});
    expect(notes).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
  });

  it("omits Product Hunt skip note when a token is present", () => {
    const notes = liveSourceDegradationNotes({
      productHuntAccessToken: "ph_test_token",
    });
    expect(notes).not.toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
    expect(notes).toEqual([]);
  });
});

describe("Skill run folder — handoff + Run Report via formatter", () => {
  it("builds a time-based run folder path under the Skill runs root", () => {
    const path = createSkillRunFolderPath({
      now: new Date("2026-08-08T19:12:00.000Z"),
    });
    expect(path).toBe(".pain-point-miner/runs/2026-08-08T19-12-00Z");
  });

  it("prepareSkillRunFolder creates the time-based directory on disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "ppm-skill-prepare-"));
    tempDirs.push(root);
    const runDir = await prepareSkillRunFolder({
      runsRoot: root,
      now: new Date("2026-08-08T19:12:00.000Z"),
    });
    expect(runDir).toBe(join(root, "2026-08-08T19-12-00Z"));
    await expect(access(runDir)).resolves.toBeUndefined();
  });

  it("assembles Run Report Markdown from Analysis outcomes without re-judging or inventing Evidence", () => {
    const cluster = gatedCluster();
    const outcomes: AnalysisOutcome[] = [
      { status: "brief", brief: brief() },
      {
        status: "hollow",
        clusterId: "cluster-wish",
        reason: "Wish-only platitudes with no concrete scene.",
        signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
      },
    ];

    const markdown = assembleRunReport({
      handoff: handoff({
        gatedClusters: [cluster],
        sourceDegradationNotes: [
          "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
        ],
      }),
      analysisOutcomes: outcomes,
      runId: ".pain-point-miner/runs/2026-08-08T19-12-00Z",
    });

    expect(markdown).toContain("# Pain Point Miner Run Report");
    expect(markdown).toContain("AI automation");
    expect(markdown).toContain(brief().painPointSummary);
    expect(markdown).toContain("Wish-only platitudes with no concrete scene.");
    expect(markdown).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
    // Quotes only from handoff cluster Evidence for Brief links.
    expect(markdown).toContain(cluster.evidence[0]!.quote);
    expect(markdown).not.toContain("https://invented.example/");
    // Not a raw RunArtifact dump.
    expect(markdown).not.toContain("# Pain Point Miner RunArtifact");
    expect(markdown).not.toContain("## Candidate Clusters");
  });

  it("assembles Archive Permalinks for Reddit Evidence when present on handoff clusters", () => {
    const canonical =
      "https://www.reddit.com/r/freelance/comments/inv1/invoice/";
    const archive =
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_inv1";
    const items = [
      evidence({
        id: "inv-1",
        quote: "I chase unpaid invoices in a spreadsheet every Friday",
        url: canonical,
        archivePermalink: archive,
        signalKind: "demand-signal",
      }),
    ];
    const cluster: CandidateCluster = {
      id: "cluster-invoice",
      evidence: items,
      evidenceCount: items.length,
      passedCountGate: true,
      signalMix: { demandSignalCount: 1, incumbentFrictionCount: 0 },
    };
    const markdown = assembleRunReport({
      handoff: handoff({ gatedClusters: [cluster] }),
      analysisOutcomes: [
        {
          status: "brief",
          brief: brief({ evidenceLinks: [canonical] }),
        },
      ],
      runId: "run-archive-assemble",
    });

    expect(markdown).toContain(archive);
    expect(markdown).toContain(`Canonical: ${canonical}`);
    expect(markdown).toContain(items[0]!.quote);
  });

  it("writes handoff.json and report.md under the time-based run folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "ppm-skill-run-"));
    tempDirs.push(root);
    const runDir = join(root, "2026-08-08T19-12-00Z");
    const miningHandoff = handoff({
      sourceDegradationNotes: [
        "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
      ],
    });
    const outcomes: AnalysisOutcome[] = [
      { status: "brief", brief: brief() },
    ];

    const written = await writeSkillRunFolder({
      runDir,
      handoff: miningHandoff,
      analysisOutcomes: outcomes,
    });

    expect(written.handoffPath).toBe(join(runDir, "handoff.json"));
    expect(written.reportPath).toBe(join(runDir, "report.md"));

    const handoffJson = JSON.parse(
      await readFile(written.handoffPath, "utf8"),
    ) as SkillMiningHandoff;
    expect(handoffJson.intent).toEqual({ theme: "AI automation" });
    expect(handoffJson.gatedClusters).toHaveLength(1);
    expect(handoffJson.sourceDegradationNotes).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
    expect(handoffJson).not.toHaveProperty("evidence");

    const report = await readFile(written.reportPath, "utf8");
    expect(report).toBe(written.reportMarkdown);
    expect(report).toContain("# Pain Point Miner Run Report");
    expect(report).toContain(brief().painPointSummary);
    expect(report).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
  });
});

describe("Skill handoff carries live source degradation notes", () => {
  it("includes sourceDegradationNotes on toSkillMiningHandoff", () => {
    const projected = toSkillMiningHandoff(
      {
        intent: {},
        evidence: [],
        candidateClusters: [],
        gatedClusters: [gatedCluster()],
        saturationStopped: false,
        analysisOutcomes: [],
        briefs: [],
        hollowRejections: [],
        visibleBriefs: [],
        hiddenByCompetitionFilter: [],
        sourceDegradationNotes: [],
      },
      {
        sourceDegradationNotes: liveSourceDegradationNotes({}),
      },
    );

    expect(Object.keys(projected).sort()).toEqual([
      "gatedClusters",
      "intent",
      "saturationStopped",
      "sourceDegradationNotes",
    ]);
    expect(projected.sourceDegradationNotes).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
  });

  it("CLI --live --handoff skill records PH skip notes when token unset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-live-handoff-"));
    tempDirs.push(dir);
    // Nested run-folder path — CLI must create parents (ENOENT otherwise).
    const outPath = join(dir, "2026-08-08T19-12-00Z", "handoff.json");

    const code = await runCli(
      ["--live", "--format", "json", "--handoff", "skill", "--out", outPath],
      liveHandoffCliIo({ env: {} }),
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      sourceDegradationNotes?: string[];
      evidence?: unknown;
    };
    expect(written.sourceDegradationNotes).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
    expect(written).not.toHaveProperty("evidence");
  });

  it("CLI --live --handoff skill omits PH skip note when PRODUCT_HUNT_TOKEN is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-live-handoff-token-"));
    tempDirs.push(dir);
    const outPath = join(dir, "handoff.json");

    const code = await runCli(
      ["--live", "--format", "json", "--handoff", "skill", "--out", outPath],
      liveHandoffCliIo({
        env: { PRODUCT_HUNT_TOKEN: "ph_present" },
        liveDiscovery: { productHuntAccessToken: "ph_present" },
      }),
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      sourceDegradationNotes?: string[];
    };
    expect(written.sourceDegradationNotes ?? []).not.toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
  });
});

function liveHandoffCliIo(overrides: {
  env: NodeJS.ProcessEnv;
  liveDiscovery?: { productHuntAccessToken?: string };
}) {
  return {
    env: overrides.env,
    ...(overrides.liveDiscovery !== undefined
      ? { liveDiscovery: overrides.liveDiscovery }
      : {}),
    embeddings: {
      async embed(texts: readonly string[]) {
        return texts.map(() => [1, 0, 0]);
      },
    },
    signalSources: [
      {
        name: "reddit",
        async collect() {
          return [
            evidence({
              id: "r-1",
              quote: "Need a tool for late invoice chase",
              signalKind: "demand-signal" as const,
            }),
          ];
        },
      },
    ],
    followOnFetcher: { async fetchPage() { return []; } },
    storeReviewSource: { async fetchReviews() { return []; } },
    stdout: { write() {} },
  };
}
