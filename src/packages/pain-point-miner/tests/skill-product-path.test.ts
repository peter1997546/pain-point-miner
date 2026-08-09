/**
 * Seams under test (ticket #38 / #51 / #56 / Seam B / ADR-0013–0017):
 * - liveSourceDegradationNotes — token-gated skips available for the Run Report
 * - assembleRunReport / writeSkillRunFolder — Report Agent integrates Analysis
 *   outcomes into a time-based run folder (handoff.json + report.md via formatter)
 * - CLI `--live --handoff skill` carries degradation notes on the Skill handoff
 * - Skill / ANALYSIS guidance — Archive Permalinks for Reddit Brief evidenceLinks
 * - createLiveDiscoveryMiner → Skill handoff → Run Report — Reddit archive Evidence
 *   flows to Builder-openable Archive Permalinks (no SERP / mirror / Skill-only crawl)
 * - Skill / CONTEXT / ADR / README / AGENTS — Intent interview-before-mine contract
 *   (tickets #56–#58 / ADR-0017); Script/CLI omit → `{}` remains valid (ADR-0004)
 *   and is not the Skill skip path
 *
 * Product Analysis Pass is Cursor agents — not createLlmAnalysisPass.
 */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import {
  assembleRunReport,
  createEntryCatalogSignalSources,
  createLiveDiscoveryMiner,
  createPainPointMiner,
  createSkillRunFolderPath,
  liveSourceDegradationNotes,
  prepareSkillRunFolder,
  toArchivePermalink,
  toSkillMiningHandoff,
  writeSkillRunFolder,
  type AnalysisOutcome,
  type AnalysisPass,
  type Brief,
  type CandidateCluster,
  type EvidenceRef,
  type JsonHttpClient,
  type SkillMiningHandoff,
} from "../index.js";

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

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

describe("Skill / ANALYSIS guidance — Archive Permalinks (ticket #51)", () => {
  it("ANALYSIS.md requires Brief evidenceLinks to include Archive Permalinks for Reddit Evidence", async () => {
    const analysis = await readFile(
      join(REPO_ROOT, ".agents/skills/pain-point-miner/ANALYSIS.md"),
      "utf8",
    );

    expect(analysis).toMatch(/Archive Permalink/i);
    expect(analysis).toMatch(/`evidenceLinks`/);
    expect(analysis).toMatch(/Reddit \(via archive\)/);
    expect(analysis).toMatch(
      /`evidenceLinks`[^\n]*Archive Permalink|Archive Permalink[^\n]*`evidenceLinks`/i,
    );
  });

  it("SKILL.md steers Analysis Pass agents to put Archive Permalinks in Reddit Brief evidenceLinks", async () => {
    const skill = await readFile(
      join(REPO_ROOT, ".agents/skills/pain-point-miner/SKILL.md"),
      "utf8",
    );
    const fanOutSection = skill.match(
      /### 2\. Fan out Analysis Pass[\s\S]*?(?=### 3\.|$)/,
    )?.[0];
    expect(fanOutSection).toBeDefined();
    expect(fanOutSection).toMatch(/Archive Permalink/i);
    expect(fanOutSection).toMatch(/evidenceLinks|Evidence links/i);
    expect(skill).toMatch(/Reddit \(via archive\)/);
    // Rejected cold-start / access bypasses must not be product fallbacks.
    expect(skill).toMatch(/Call the Script/);
    expect(skill).not.toMatch(/site:reddit\.com|libreddit|redlib|teddit/i);
  });
});

describe("Skill Intent interview before mine (tickets #56–#58 / ADR-0017)", () => {
  async function readSkill(): Promise<string> {
    return readFile(
      join(REPO_ROOT, ".agents/skills/pain-point-miner/SKILL.md"),
      "utf8",
    );
  }

  it("Hard rules keep Interview before mine and forbid unilateral empty-Intent defaults", async () => {
    const skill = await readSkill();
    const hardRules = skill.match(
      /## Hard rules[\s\S]*?(?=## Process|$)/,
    )?.[0];
    expect(hardRules).toBeDefined();
    expect(hardRules).toMatch(/Interview before mine/i);
    expect(hardRules).toMatch(/ADR-0017/);
    expect(hardRules).toMatch(/do not recommend empty/i);
    expect(hardRules).toMatch(
      /Do not claim you will run with empty Intent/i,
    );
    expect(hardRules).toMatch(
      /explicitly fills? fields? or says? they are skipping/i,
    );
  });

  it("step 0 guides functional Intent fields, allows blank, and waits for explicit fill or skip", async () => {
    const skill = await readSkill();
    const step0 = skill.match(
      /### 0\. Interview Intent[\s\S]*?(?=### 1\.|$)/,
    )?.[0];
    expect(step0).toBeDefined();
    expect(step0).toMatch(/Theme/);
    expect(step0).toMatch(/product shape/i);
    expect(step0).toMatch(/constraints/i);
    expect(step0).toMatch(/hard nos/i);
    expect(step0).toMatch(/success definition/i);
    expect(step0).toMatch(/illustrative/i);
    expect(step0).toMatch(/leave (any or all |fields )?blank|may leave/i);
    expect(step0).toMatch(/do \*\*not\*\* recommend empty|do not recommend empty/i);
    expect(step0).toMatch(/Stop and wait|wait.*explicit/i);
    // Explicit skip vocabulary from issue #56 (Chinese “不填” / skip / equivalent).
    expect(step0).toMatch(/不填|skip/i);
    expect(step0).toMatch(
      /\*\*Done when:\*\*[^\n]*(explicitly filled|explicit fill|explicitly skipped)/i,
    );
    // Leave gate/filter overrides out of the Intent interview unless volunteered.
    expect(step0).toMatch(
      /Do \*\*not\*\* interrogate Count Gate \/ Saturation Stop \/ Competition Filter/i,
    );
    expect(step0).not.toMatch(
      /\|\s*(Count Gate|Saturation Stop|Competition Filter)\s*\|/,
    );
  });

  it("Skill acknowledges Script/CLI may omit Intent after the interview without interviewing", async () => {
    const skill = await readSkill();
    expect(skill).toMatch(/Script\/CLI may omit Intent/);
    expect(skill).toMatch(/does not interview/i);
    expect(skill).toMatch(/Wire Intent flags the Builder actually answered/);
  });

  it("CONTEXT and ADR-0017 / ADR-0004 keep Skill interview vs Script empty-Intent split", async () => {
    const [context, adr0017, adr0004] = await Promise.all([
      readFile(join(REPO_ROOT, "CONTEXT.md"), "utf8"),
      readFile(
        join(REPO_ROOT, "docs/adr/0017-skill-must-interview-intent.md"),
        "utf8",
      ),
      readFile(
        join(REPO_ROOT, "docs/adr/0004-discovery-over-restriction.md"),
        "utf8",
      ),
    ]);

    expect(context).toMatch(
      /\*\*Skill\*\*:[\s\S]*?guide[\s\S]*?Intent[\s\S]*?explicit fill or skip/i,
    );
    expect(context).toMatch(
      /\*\*Script\*\*:[\s\S]*?does not interview the Builder/i,
    );
    expect(context).toMatch(
      /\*\*Intent\*\*:[\s\S]*?valid \*\*Script\*\* run input[\s\S]*?does not mean the Skill may skip the interview/i,
    );

    expect(adr0017).toMatch(/interview Intent before invoking Script/i);
    expect(adr0017).toMatch(/do not recommend empty/i);
    expect(adr0017).toMatch(/explicit fill or skip/i);
    expect(adr0017).toMatch(/does not interview/i);

    expect(adr0004).toMatch(/empty Intent must still be a valid run/i);
    expect(adr0004).toMatch(/does not excuse skipping the Skill Intent interview/i);
    expect(adr0004).toMatch(/ADR-0017/);
  });

  it("README product path and AGENTS pointer require guide-then-Script (ticket #57)", async () => {
    const [readme, agents] = await Promise.all([
      readFile(join(REPO_ROOT, "README.md"), "utf8"),
      readFile(join(REPO_ROOT, "AGENTS.md"), "utf8"),
    ]);

    const skillPath = readme.match(
      /## Skill[\s\S]*?(?=## |$)/,
    )?.[0];
    expect(skillPath).toBeDefined();
    expect(skillPath).toMatch(/ADR-0017/);
    expect(skillPath).toMatch(
      /Guide optional Intent[\s\S]*?wait for explicit fill or skip/i,
    );
    expect(skillPath).toMatch(
      /only then may Intent be empty for the Script/i,
    );

    // Product-seam “empty valid” language must stay scoped to Script/API input.
    expect(readme).toMatch(
      /Empty Intent is a valid Script\/API run input/i,
    );
    expect(readme).toMatch(
      /On the Skill path, empty is only after an explicit Builder skip \(ADR-0017\)/i,
    );
    expect(readme).toMatch(
      /Empty Intent `\{\}` as \*\*Script\*\* run input[\s\S]*?ADR-0017/i,
    );

    expect(agents).toMatch(/ADR-0017/);
    expect(agents).toMatch(/Guide Intent then call the Script/i);
  });
});

describe("Live composition Skill path — Reddit archive → Run Report (ticket #51)", () => {
  function scriptedHttp(
    handler: (url: string) => unknown,
  ): JsonHttpClient & { readonly requestedUrls: readonly string[] } {
    const requestedUrls: string[] = [];
    return {
      get requestedUrls() {
        return requestedUrls;
      },
      async getJson(url: string) {
        requestedUrls.push(url);
        return handler(url);
      },
    };
  }

  it("createLiveDiscoveryMiner Entry Catalog Reddit archive Evidence flows through Skill handoff to Run Report Archive Permalinks", async () => {
    const invoiceTitle = "wish: tool for chasing late invoices";
    const invoiceBody =
      "I chase unpaid invoices in a spreadsheet every Friday — need a tool";
    let archiveSeq = 0;
    const http = scriptedHttp((url) => {
      const parsed = new URL(url);
      if (parsed.hostname === "arctic-shift.photon-reddit.com") {
        archiveSeq += 1;
        const id = `inv${archiveSeq}`;
        const board = parsed.searchParams.get("subreddit") ?? "freelance";
        return {
          data: [
            {
              id,
              title: invoiceTitle,
              selftext: `${invoiceBody} (${id})`,
              subreddit: board,
              permalink: `/r/${board}/comments/${id}/invoice/`,
            },
          ],
        };
      }
      if (parsed.hostname === "hn.algolia.com") {
        return {
          hits: [
            {
              objectID: "hn-ask-clinic",
              title: "Ask HN: How do you schedule clinic appointments?",
              story_text: "Looking for clinic scheduling ideas.",
            },
          ],
        };
      }
      throw new Error(`Unexpected host in live composition: ${parsed.hostname}`);
    });

    const miner = createLiveDiscoveryMiner({
      http,
      embeddings: {
        async embed(texts) {
          return texts.map((text) =>
            text.includes("invoices") || text.includes(invoiceTitle)
              ? [1, 0, 0]
              : [0, 1, 0],
          );
        },
      },
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });

    const artifact = await miner.run({ countGateThreshold: 5 });
    const handoff = toSkillMiningHandoff(artifact, {
      sourceDegradationNotes: liveSourceDegradationNotes({}),
    });

    expect(http.requestedUrls.some((url) => url.includes("arctic-shift"))).toBe(
      true,
    );
    expect(http.requestedUrls.some((url) => url.includes("hn.algolia.com"))).toBe(
      true,
    );
    for (const url of http.requestedUrls) {
      expect(url).not.toMatch(/www\.reddit\.com/i);
      expect(url).not.toMatch(/google\.|bing\.|libreddit|redlib|teddit/i);
    }

    const redditGated = handoff.gatedClusters.filter((cluster) =>
      cluster.evidence.some((item) => item.signalSource === "reddit"),
    );
    expect(redditGated.length).toBeGreaterThan(0);
    const redditEvidence = redditGated.flatMap((cluster) =>
      cluster.evidence.filter((item) => item.signalSource === "reddit"),
    );
    expect(redditEvidence.length).toBeGreaterThanOrEqual(5);
    for (const item of redditEvidence) {
      expect(item.archivePermalink).toMatch(
        /^https:\/\/arctic-shift\.photon-reddit\.com\/search\?/,
      );
      expect(toArchivePermalink(item.url)).toBe(item.archivePermalink);
    }

    // Analysis Pass double mirrors Cursor-agent guidance: Brief evidenceLinks
    // include Archive Permalinks from cluster Evidence.
    const analysisPass: AnalysisPass = {
      async analyze({ cluster }) {
        return {
          status: "brief",
          brief: brief({
            clusterId: cluster.id,
            painPointSummary:
              "Freelancers lose Fridays chasing late invoices in spreadsheets.",
            evidenceLinks: cluster.evidence.map(
              (item) => item.archivePermalink ?? item.url,
            ),
            signalMix: cluster.signalMix,
          }),
        };
      },
    };
    const analysisOutcomes: AnalysisOutcome[] = await Promise.all(
      handoff.gatedClusters.map((cluster) =>
        analysisPass.analyze({ cluster, intent: handoff.intent }),
      ),
    );

    const root = await mkdtemp(join(tmpdir(), "ppm-skill-archive-live-"));
    tempDirs.push(root);
    const runDir = join(root, "2026-08-09T12-00-00Z");
    const written = await writeSkillRunFolder({
      runDir,
      handoff,
      analysisOutcomes,
    });
    const report = await readFile(written.reportPath, "utf8");

    expect(report).toContain(redditEvidence[0]!.archivePermalink!);
    expect(report).toContain("Canonical:");
    expect(report).toMatch(/www\.reddit\.com\/r\/.+\/comments\/inv/);
    expect(report).not.toMatch(/google\.|bing\.|site:reddit|libreddit|redlib|teddit/i);
  });

  it("Skill handoff labels Reddit channel as Reddit (via archive) when archive cold-start degrades", async () => {
    const http = scriptedHttp((url) => {
      const parsed = new URL(url);
      if (parsed.hostname === "arctic-shift.photon-reddit.com") {
        throw new Error("archive down");
      }
      if (parsed.hostname === "hn.algolia.com") {
        return {
          hits: [
            {
              objectID: "hn-survives",
              title: "Ask HN: I wish inventory was easier",
              story_text: "Still using a spreadsheet.",
            },
          ],
        };
      }
      throw new Error(`Unexpected host: ${parsed.hostname}`);
    });

    const miner = createPainPointMiner({
      signalSources: createEntryCatalogSignalSources({ http }),
      embeddings: {
        async embed(texts) {
          return texts.map(() => [0, 1, 0]);
        },
      },
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });
    const artifact = await miner.run({});
    const handoff = toSkillMiningHandoff(artifact, {
      sourceDegradationNotes: liveSourceDegradationNotes({}),
    });

    expect(
      handoff.sourceDegradationNotes.some(
        (note) =>
          note.includes("reddit") && note.includes("Reddit (via archive)"),
      ),
    ).toBe(true);
    expect(
      artifact.evidence.some((item) => item.signalSource === "hacker-news"),
    ).toBe(true);
    for (const url of http.requestedUrls) {
      expect(url).not.toMatch(/www\.reddit\.com/i);
      expect(url).not.toMatch(/google\.|bing\.|libreddit|redlib|teddit/i);
    }

    const markdown = assembleRunReport({
      handoff,
      analysisOutcomes: [],
      runId: "run-archive-degraded",
    });
    expect(markdown).toMatch(/Reddit \(via archive\)/);
  });
});
