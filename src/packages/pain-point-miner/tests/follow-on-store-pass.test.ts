import { describe, expect, it } from "vitest";
import {
  createPainPointMiner,
  type Embeddings,
  type EvidenceRef,
  type FollowOnFetcher,
  type MentionedApp,
  type SignalSource,
  type StoreReviewSource,
} from "../index.js";

const INVOICE_VEC = [1, 0, 0] as const;
const DEMAND_PAGE_VEC = [1, 0, 0] as const;
const ALT_PAGE_VEC = [0, 1, 0] as const;
const STORE_VEC = [1, 0, 0] as const;

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
    Partial<Pick<EvidenceRef, "url" | "signalSource" | "structuralKey">>,
): EvidenceRef {
  return {
    url: partial.url ?? `https://example.com/${partial.id}`,
    signalSource: partial.signalSource ?? "reddit",
    ...partial,
  };
}

describe("PainPointMiner.run — Follow-on Fetch and Store Second Pass", () => {
  it("Follow-on Fetch pursues demand-relevant pages discovered during the run", async () => {
    const seed = evidence({
      id: "seed-demand",
      quote: "I wish there was a tool that chased late freelance invoices",
      structuralKey: "late-payments",
      followOnTargets: [
        {
          url: "https://news.ycombinator.com/item?id=demand-thread",
          kind: "demand-signal",
        },
      ],
    });
    const deepened = evidence({
      id: "follow-demand-1",
      quote: "Same unpaid-invoice chase pain in the Ask HN thread",
      url: "https://news.ycombinator.com/item?id=demand-thread",
      signalSource: "hacker-news",
      structuralKey: "late-payments",
    });

    const fetchedUrls: string[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        fetchedUrls.push(url);
        if (url === deepened.url) {
          return [deepened];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
        [deepened.quote]: DEMAND_PAGE_VEC,
      }),
      followOnFetcher,
    });

    const artifact = await miner.run({ countGateThreshold: 2 });

    expect(fetchedUrls).toEqual([deepened.url]);
    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-demand",
      "follow-demand-1",
    ]);
    expect(artifact.gatedClusters).toHaveLength(1);
    expect(artifact.gatedClusters[0]!.evidenceCount).toBe(2);
    expect(
      artifact.gatedClusters[0]!.evidence.map((item) => item.id).sort(),
    ).toEqual(["follow-demand-1", "seed-demand"]);
  });

  it("Follow-on prefers Demand Signal deepenings over alternative/review pages", async () => {
    const seed = evidence({
      id: "seed-mix",
      quote: "Looking for invoice chase help; also saw alternatives to QuickBooks",
      followOnTargets: [
        {
          url: "https://example.com/best-alternatives-to-quickbooks",
          kind: "alternative-review",
        },
        {
          url: "https://reddit.com/r/freelance/comments/demand-wish",
          kind: "demand-signal",
        },
      ],
    });
    const demandDeep = evidence({
      id: "deep-demand",
      quote: "Concrete wish for autopilot dunning — Demand Signal page",
      url: "https://reddit.com/r/freelance/comments/demand-wish",
      structuralKey: "late-payments",
    });
    const altDeep = evidence({
      id: "deep-alt",
      quote: "Roundup of QuickBooks alternatives — review page",
      url: "https://example.com/best-alternatives-to-quickbooks",
      signalSource: "product-hunt",
      structuralKey: "qb-alts",
    });

    const fetchedUrls: string[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        fetchedUrls.push(url);
        if (url === demandDeep.url) {
          return [demandDeep];
        }
        if (url === altDeep.url) {
          return [altDeep];
        }
        return [];
      },
    };

    // Entry catalog stays below the Count Gate (4); the preferred Demand
    // Signal deepen completes the gate and trips Saturation Stop before
    // alternative/review pages are fetched.
    const pad = Array.from({ length: 3 }, (_, i) =>
      evidence({
        id: `pad-${i}`,
        quote: `invoice pad ${i}`,
        structuralKey: "late-payments",
      }),
    );

    const quoteVectors: Record<string, readonly number[]> = {
      [seed.quote]: INVOICE_VEC,
      [demandDeep.quote]: DEMAND_PAGE_VEC,
      [altDeep.quote]: ALT_PAGE_VEC,
    };
    for (const item of pad) {
      quoteVectors[item.quote] = INVOICE_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed, ...pad])],
      embeddings: embeddingsByQuote(quoteVectors),
      followOnFetcher,
    });

    const artifact = await miner.run({
      countGateThreshold: 5,
      saturationStopK: 1,
    });

    expect(fetchedUrls).toEqual([demandDeep.url]);
    expect(artifact.saturationStopped).toBe(true);
    expect(artifact.evidence.some((item) => item.id === "deep-demand")).toBe(
      true,
    );
    expect(artifact.evidence.some((item) => item.id === "deep-alt")).toBe(
      false,
    );
  });

  it("Store Second Pass fetches store reviews only for apps mentioned in forum Evidence", async () => {
    const forumMention = evidence({
      id: "forum-mention",
      quote: "Wave keeps losing my invoice reminders — anyone else?",
      signalSource: "reddit",
      structuralKey: "wave-reminders",
      mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
    });
    const pad = Array.from({ length: 4 }, (_, i) =>
      evidence({
        id: `forum-pad-${i}`,
        quote: `Wave reminder friction ${i}`,
        signalSource: "hacker-news",
        structuralKey: "wave-reminders",
      }),
    );
    const storeReview = evidence({
      id: "store-wave-1",
      quote: "App Store: invoice reminders silently fail in Wave",
      url: "https://apps.apple.com/app/wave/id999",
      signalSource: "app-store",
      structuralKey: "wave-reminders",
    });
    const decoyApp: MentionedApp = { id: "quickbooks", store: "play" };

    const requestedApps: MentionedApp[] = [];
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app) {
        requestedApps.push(app);
        if (app.id === "wave-accounting" && app.store === "app-store") {
          return [storeReview];
        }
        if (app.id === decoyApp.id) {
          throw new Error("preset app-list sweep must not be the primary strategy");
        }
        return [];
      },
    };

    const quoteVectors: Record<string, readonly number[]> = {
      [forumMention.quote]: INVOICE_VEC,
      [storeReview.quote]: STORE_VEC,
    };
    for (const item of pad) {
      quoteVectors[item.quote] = INVOICE_VEC;
    }

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [forumMention, ...pad])],
      embeddings: embeddingsByQuote(quoteVectors),
      storeReviewSource,
      // A preset catalog on the adapter must not be swept — only mentions.
      // (decoy exists only inside the adapter; miner must not invent fetches)
    });

    const artifact = await miner.run({ countGateThreshold: 5 });

    expect(requestedApps).toEqual([
      { id: "wave-accounting", store: "app-store" },
    ]);
    expect(artifact.evidence.some((item) => item.id === "store-wave-1")).toBe(
      true,
    );
    expect(artifact.gatedClusters).toHaveLength(1);
    expect(artifact.gatedClusters[0]!.evidenceCount).toBe(6);
    expect(
      artifact.gatedClusters[0]!.evidence.some((item) => item.id === "store-wave-1"),
    ).toBe(true);
  });

  it("does not treat store Evidence mentions as the Store Second Pass seed list", async () => {
    const storeOnly = evidence({
      id: "already-store",
      quote: "Play review complaining about Notion sync",
      signalSource: "play",
      mentionedApps: [{ id: "notion", store: "play" }],
    });

    const requestedApps: MentionedApp[] = [];
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app) {
        requestedApps.push(app);
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("play", [storeOnly])],
      embeddings: embeddingsByQuote({
        [storeOnly.quote]: STORE_VEC,
      }),
      storeReviewSource,
    });

    await miner.run({});

    expect(requestedApps).toEqual([]);
  });

  it("fetches Demand Signal pages before alternative/review when both deepen", async () => {
    const seed = evidence({
      id: "seed-order",
      quote: "Need invoice chase; also reading QuickBooks alternative lists",
      followOnTargets: [
        {
          url: "https://example.com/best-alternatives-to-quickbooks",
          kind: "alternative-review",
        },
        {
          url: "https://reddit.com/r/freelance/comments/demand-wish",
          kind: "demand-signal",
        },
      ],
    });
    const demandDeep = evidence({
      id: "deep-demand-order",
      quote: "Demand page about missing dunning tool",
      url: "https://reddit.com/r/freelance/comments/demand-wish",
    });
    const altDeep = evidence({
      id: "deep-alt-order",
      quote: "Alternative roundup page",
      url: "https://example.com/best-alternatives-to-quickbooks",
      signalSource: "product-hunt",
    });

    const fetchedUrls: string[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        fetchedUrls.push(url);
        if (url === demandDeep.url) {
          return [demandDeep];
        }
        if (url === altDeep.url) {
          return [altDeep];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
        [demandDeep.quote]: DEMAND_PAGE_VEC,
        [altDeep.quote]: ALT_PAGE_VEC,
      }),
      followOnFetcher,
    });

    const artifact = await miner.run({});

    expect(fetchedUrls).toEqual([demandDeep.url, altDeep.url]);
    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-order",
      "deep-demand-order",
      "deep-alt-order",
    ]);
  });

  it("pursues Follow-on targets discovered on deepened pages during the run", async () => {
    const seed = evidence({
      id: "seed-nested",
      quote: "Thread pointing at a demand Ask HN",
      followOnTargets: [
        {
          url: "https://news.ycombinator.com/item?id=outer",
          kind: "demand-signal",
        },
      ],
    });
    const outer = evidence({
      id: "outer-page",
      quote: "Ask HN outer thread that links a concrete wish post",
      url: "https://news.ycombinator.com/item?id=outer",
      signalSource: "hacker-news",
      followOnTargets: [
        {
          url: "https://reddit.com/r/smallbusiness/comments/inner-wish",
          kind: "demand-signal",
        },
      ],
    });
    const inner = evidence({
      id: "inner-page",
      quote: "Concrete wish for inventory without spreadsheets",
      url: "https://reddit.com/r/smallbusiness/comments/inner-wish",
    });

    const fetchedUrls: string[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        fetchedUrls.push(url);
        if (url === outer.url) {
          return [outer];
        }
        if (url === inner.url) {
          return [inner];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
        [outer.quote]: DEMAND_PAGE_VEC,
        [inner.quote]: ALT_PAGE_VEC,
      }),
      followOnFetcher,
    });

    const artifact = await miner.run({});

    expect(fetchedUrls).toEqual([outer.url, inner.url]);
    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-nested",
      "outer-page",
      "inner-page",
    ]);
  });

  it("Store Second Pass uses apps mentioned on Follow-on forum Evidence", async () => {
    const seed = evidence({
      id: "seed-to-mention",
      quote: "Linking a freelance thread about Wave reminders",
      followOnTargets: [
        {
          url: "https://reddit.com/r/freelance/comments/wave-thread",
          kind: "demand-signal",
        },
      ],
    });
    const deepenedForum = evidence({
      id: "deep-wave-mention",
      quote: "Wave keeps dropping invoice reminders for freelancers",
      url: "https://reddit.com/r/freelance/comments/wave-thread",
      structuralKey: "wave-reminders",
      mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
    });
    const storeReview = evidence({
      id: "store-from-follow-on",
      quote: "App Store: Wave reminders never fire",
      url: "https://apps.apple.com/app/wave/id1001",
      signalSource: "app-store",
      structuralKey: "wave-reminders",
    });

    const requestedApps: MentionedApp[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        return url === deepenedForum.url ? [deepenedForum] : [];
      },
    };
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app) {
        requestedApps.push(app);
        if (app.id === "wave-accounting") {
          return [storeReview];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
        [deepenedForum.quote]: DEMAND_PAGE_VEC,
        [storeReview.quote]: STORE_VEC,
      }),
      followOnFetcher,
      storeReviewSource,
    });

    const artifact = await miner.run({});

    expect(requestedApps).toEqual([
      { id: "wave-accounting", store: "app-store" },
    ]);
    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-to-mention",
      "deep-wave-mention",
      "store-from-follow-on",
    ]);
  });

  it("degrades gracefully when one Follow-on Fetch throws, keeping seed and successful deepenings", async () => {
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
      structuralKey: "late-payments",
    });

    const fetchedUrls: string[] = [];
    const followOnFetcher: FollowOnFetcher = {
      async fetchPage(url) {
        fetchedUrls.push(url);
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
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
        [deepened.quote]: DEMAND_PAGE_VEC,
      }),
      followOnFetcher,
    });

    const artifact = await miner.run({});

    expect(fetchedUrls.sort()).toEqual([brokenUrl, okUrl].sort());
    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-follow-on-mix",
      "follow-on-ok",
    ]);
    expect(artifact.sourceDegradationNotes).toEqual([
      `Follow-on Fetch degraded for ${brokenUrl}: simulated Follow-on Fetch outage`,
    ]);
  });

  it("degrades gracefully when one Store Second Pass throws, keeping other Evidence", async () => {
    const forumWave = evidence({
      id: "forum-wave",
      quote: "Wave keeps losing my invoice reminders — anyone else?",
      signalSource: "reddit",
      structuralKey: "wave-reminders",
      mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
    });
    const forumNotion = evidence({
      id: "forum-notion",
      quote: "Notion sync silently drops freelance invoice drafts",
      signalSource: "hacker-news",
      structuralKey: "notion-sync",
      mentionedApps: [{ id: "notion", store: "play" }],
    });
    const storeWave = evidence({
      id: "store-wave-ok",
      quote: "App Store: invoice reminders silently fail in Wave",
      url: "https://apps.apple.com/app/wave/id999",
      signalSource: "app-store",
      structuralKey: "wave-reminders",
    });

    const requestedApps: MentionedApp[] = [];
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews(app) {
        requestedApps.push(app);
        if (app.id === "notion" && app.store === "play") {
          throw new Error("simulated Store Second Pass outage");
        }
        if (app.id === "wave-accounting" && app.store === "app-store") {
          return [storeWave];
        }
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [forumWave, forumNotion])],
      embeddings: embeddingsByQuote({
        [forumWave.quote]: INVOICE_VEC,
        [forumNotion.quote]: ALT_PAGE_VEC,
        [storeWave.quote]: STORE_VEC,
      }),
      storeReviewSource,
    });

    const artifact = await miner.run({});

    expect(requestedApps).toEqual([
      { id: "wave-accounting", store: "app-store" },
      { id: "notion", store: "play" },
    ]);
    expect(artifact.evidence.map((item) => item.id).sort()).toEqual([
      "forum-notion",
      "forum-wave",
      "store-wave-ok",
    ]);
    expect(artifact.sourceDegradationNotes).toEqual([
      "Store Second Pass degraded for play:notion: simulated Store Second Pass outage",
    ]);
  });

  it("treats empty successful Follow-on and Store fetches as empty batches", async () => {
    const seed = evidence({
      id: "seed-empty-batches",
      quote: "Forum post that mentions Wave and links a demand page",
      followOnTargets: [
        {
          url: "https://reddit.com/r/freelance/comments/empty-page",
          kind: "demand-signal",
        },
      ],
      mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
    });

    const followOnFetcher: FollowOnFetcher = {
      async fetchPage() {
        return [];
      },
    };
    const storeReviewSource: StoreReviewSource = {
      async fetchReviews() {
        return [];
      },
    };

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [seed])],
      embeddings: embeddingsByQuote({
        [seed.quote]: INVOICE_VEC,
      }),
      followOnFetcher,
      storeReviewSource,
    });

    const artifact = await miner.run({});

    expect(artifact.evidence.map((item) => item.id)).toEqual([
      "seed-empty-batches",
    ]);
  });
});
