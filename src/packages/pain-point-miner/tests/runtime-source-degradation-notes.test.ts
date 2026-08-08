/**
 * Seams under test (ticket #43 / US 11 gap / ADR-0014):
 * - PainPointMiner.run → RunArtifact.sourceDegradationNotes — port-level
 *   Signal Source / Follow-on / Store Second Pass runtime degradation notes
 * - toSkillMiningHandoff merges runtime notes with token-gated skip notes
 *   (liveSourceDegradationNotes) without overwriting either set
 * - CLI `--live --handoff skill` carries the merged notes on the Skill handoff
 *
 * Adapter-internal silent empties (single URL inside a healthy adapter) are
 * out of scope. Offline injectable doubles only — no live network.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import {
  createFixtureEmbeddings,
  createPainPointMiner,
  liveSourceDegradationNotes,
  PRODUCT_HUNT_FOLLOW_ON_SKIPPED_NOTE,
  toSkillMiningHandoff,
  type EvidenceRef,
  type FollowOnFetcher,
  type MentionedApp,
  type SignalSource,
  type StoreReviewSource,
} from "../index.js";

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

function failingSource(name: string, message: string): SignalSource {
  return {
    name,
    async collect() {
      throw new Error(message);
    },
  };
}

describe("PainPointMiner.run — runtime source degradation notes", () => {
  it("keeps notes empty when every Signal Source / deepen succeeds", async () => {
    const miner = createPainPointMiner({
      signalSources: [
        sourceFrom("reddit", [
          evidence({
            id: "ok-1",
            quote: "Need a tool for late invoice chase",
            signalKind: "demand-signal",
          }),
        ]),
      ],
      embeddings: createFixtureEmbeddings(),
      followOnFetcher: { async fetchPage() { return []; } },
      storeReviewSource: { async fetchReviews() { return []; } },
    });

    const artifact = await miner.run({});

    expect(artifact.sourceDegradationNotes).toEqual([]);
  });

  it("notes Entry Catalog Signal Source failures without voiding the run", async () => {
    const ok = evidence({
      id: "ok-reddit",
      quote: "Still hunting clients for money they owe",
      signalKind: "demand-signal",
    });
    const miner = createPainPointMiner({
      signalSources: [
        failingSource("broken-before", "simulated Signal Source outage"),
        sourceFrom("reddit", [ok]),
        failingSource("broken-after", "another Signal Source outage"),
      ],
      embeddings: createFixtureEmbeddings(),
    });

    const artifact = await miner.run({});

    expect(artifact.evidence.map((item) => item.id)).toEqual(["ok-reddit"]);
    expect(artifact.sourceDegradationNotes).toEqual([
      'Signal Source "broken-before" degraded: simulated Signal Source outage',
      'Signal Source "broken-after" degraded: another Signal Source outage',
    ]);
  });

  it("notes Follow-on Fetch failures while keeping successful deepenings", async () => {
    const brokenUrl = "https://news.ycombinator.com/item?id=broken-follow-on";
    const okUrl = "https://reddit.com/r/freelance/comments/ok-follow-on";
    const seed = evidence({
      id: "seed-follow-on-mix",
      quote: "Thread that points at a broken page and a good demand page",
      followOnTargets: [
        { url: brokenUrl, kind: "demand-signal" },
        { url: okUrl, kind: "demand-signal" },
      ],
    });
    const deepened = evidence({
      id: "follow-on-ok",
      quote: "Concrete wish for autopilot invoice chase from the good page",
      url: okUrl,
    });
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        if (url === brokenUrl) {
          throw new Error("simulated Follow-on Fetch outage");
        }
        if (url === okUrl) {
          return [deepened];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: createFixtureEmbeddings(),
      followOnFetcher,
    });

    const artifact = await miner.run({});

    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-follow-on-mix",
      "follow-on-ok",
    ]);
    expect(artifact.sourceDegradationNotes).toEqual([
      `Follow-on Fetch degraded for ${brokenUrl}: simulated Follow-on Fetch outage`,
    ]);
  });

  it("notes Store Second Pass failures while keeping other Evidence", async () => {
    const forumWave = evidence({
      id: "forum-wave",
      quote: "Wave keeps losing my invoice reminders — anyone else?",
      mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
    });
    const forumNotion = evidence({
      id: "forum-notion",
      quote: "Notion sync silently drops freelance invoice drafts",
      signalSource: "hacker-news",
      mentionedApps: [{ id: "notion", store: "play" }],
    });
    const storeWave = evidence({
      id: "store-wave-ok",
      quote: "App Store: invoice reminders silently fail in Wave",
      url: "https://apps.apple.com/app/wave/id999",
      signalSource: "app-store",
    });
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app: MentionedApp) {
        if (app.id === "notion" && app.store === "play") {
          throw new Error("timeout");
        }
        if (app.id === "wave-accounting" && app.store === "app-store") {
          return [storeWave];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [forumWave, forumNotion])],
      embeddings: createFixtureEmbeddings(),
      storeReviewSource,
    });

    const artifact = await miner.run({});

    expect(artifact.evidence.map((item) => item.id).sort()).toEqual([
      "forum-notion",
      "forum-wave",
      "store-wave-ok",
    ]);
    expect(artifact.sourceDegradationNotes).toEqual([
      "Store Second Pass degraded for play:notion: timeout",
    ]);
  });
});

describe("Skill handoff merges runtime + token-gated degradation notes", () => {
  it("merges artifact runtime notes with liveSourceDegradationNotes without overwrite", () => {
    const projected = toSkillMiningHandoff(
      {
        intent: {},
        evidence: [],
        candidateClusters: [],
        gatedClusters: [],
        saturationStopped: false,
        analysisOutcomes: [],
        briefs: [],
        hollowRejections: [],
        visibleBriefs: [],
        hiddenByCompetitionFilter: [],
        sourceDegradationNotes: [
          'Signal Source "reddit" degraded: simulated Signal Source outage',
          "Store Second Pass degraded for app-store:wave-accounting: timeout",
        ],
      },
      {
        sourceDegradationNotes: liveSourceDegradationNotes({}),
      },
    );

    expect(projected.sourceDegradationNotes).toEqual([
      PRODUCT_HUNT_FOLLOW_ON_SKIPPED_NOTE,
      'Signal Source "reddit" degraded: simulated Signal Source outage',
      "Store Second Pass degraded for app-store:wave-accounting: timeout",
    ]);
  });

  it("CLI --live --handoff skill merges PH skip notes with runtime Signal Source notes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-runtime-degrade-"));
    tempDirs.push(dir);
    const outPath = join(dir, "handoff.json");

    const code = await runCli(
      ["--live", "--format", "json", "--handoff", "skill", "--out", outPath],
      {
        env: {},
        embeddings: {
          async embed(texts: readonly string[]) {
            return texts.map(() => [1, 0, 0]);
          },
        },
        signalSources: [
          failingSource("broken-live", "simulated live Entry Catalog outage"),
          sourceFrom("reddit", [
            evidence({
              id: "r-1",
              quote: "Need a tool for late invoice chase",
              signalKind: "demand-signal",
            }),
          ]),
        ],
        followOnFetcher: { async fetchPage() { return []; } },
        storeReviewSource: { async fetchReviews() { return []; } },
        stdout: { write() {} },
      },
    );

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      sourceDegradationNotes?: string[];
      evidence?: unknown;
    };
    expect(written.sourceDegradationNotes).toEqual([
      PRODUCT_HUNT_FOLLOW_ON_SKIPPED_NOTE,
      'Signal Source "broken-live" degraded: simulated live Entry Catalog outage',
    ]);
    expect(written).not.toHaveProperty("evidence");
  });
});
