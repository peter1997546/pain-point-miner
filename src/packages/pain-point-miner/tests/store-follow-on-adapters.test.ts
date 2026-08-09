import { describe, expect, it } from "vitest";
import {
  ARCTIC_SHIFT_API_BASE,
  createAppStoreReviewSource,
  createEntryCatalogSignalSources,
  createFixtureEmbeddings,
  createIndieHackersFollowOnFetcher,
  createPainPointMiner,
  createPlayStoreReviewSource,
  createProductHuntFollowOnFetcher,
  createRedditFollowOnFetcher,
  createSourceCatalogFollowOnFetcher,
  createStoreReviewSource,
  toArchivePermalink,
  type AdapterHttpClient,
  type EvidenceRef,
  type MentionedApp,
  type SignalSource,
} from "../index.js";

/**
 * Seams under test (ticket #11 / #50 / ADR-0007 / ADR-0010 / ADR-0016):
 * - StoreReviewSource.fetchReviews for App Store + Play (Store Second Pass)
 * - FollowOnFetcher.fetchPage for Product Hunt + Indie Hackers + Reddit (via archive)
 * - Injectable AdapterHttpClient (recordings — no live network in CI)
 * - createEntryCatalogSignalSources stays Reddit + HN only (PH/IH not cold-start)
 * - PainPointMiner.run combines forum cold start + follow-on + store through one seam
 */

function createScriptedAdapterHttpClient(handlers: {
  getJson?: (url: string) => unknown;
  postJson?: (
    url: string,
    body: unknown,
    init?: { headers?: Readonly<Record<string, string>> },
  ) => unknown;
  postForm?: (url: string, body: string) => string;
  getText?: (url: string) => string;
}): AdapterHttpClient & {
  readonly getJsonUrls: readonly string[];
  readonly postJsonUrls: readonly string[];
  readonly postFormUrls: readonly string[];
  readonly getTextUrls: readonly string[];
} {
  const getJsonUrls: string[] = [];
  const postJsonUrls: string[] = [];
  const postFormUrls: string[] = [];
  const getTextUrls: string[] = [];
  return {
    get getJsonUrls() {
      return getJsonUrls;
    },
    get postJsonUrls() {
      return postJsonUrls;
    },
    get postFormUrls() {
      return postFormUrls;
    },
    get getTextUrls() {
      return getTextUrls;
    },
    async getJson(url) {
      getJsonUrls.push(url);
      if (!handlers.getJson) {
        throw new Error(`Unexpected getJson: ${url}`);
      }
      return handlers.getJson(url);
    },
    async postJson(url, body, init) {
      postJsonUrls.push(url);
      if (!handlers.postJson) {
        throw new Error(`Unexpected postJson: ${url}`);
      }
      return handlers.postJson(url, body, init);
    },
    async postForm(url, body) {
      postFormUrls.push(url);
      if (!handlers.postForm) {
        throw new Error(`Unexpected postForm: ${url}`);
      }
      return handlers.postForm(url, body);
    },
    async getText(url) {
      getTextUrls.push(url);
      if (!handlers.getText) {
        throw new Error(`Unexpected getText: ${url}`);
      }
      return handlers.getText(url);
    },
  };
}

function itunesSearchResult(trackId: number, trackName: string) {
  return {
    resultCount: 1,
    results: [
      {
        trackId,
        trackName,
        trackViewUrl: `https://apps.apple.com/us/app/id${trackId}`,
      },
    ],
  };
}

function appStoreReviewsFeed(
  ...reviews: { id: string; title: string; content: string; rating: string }[]
) {
  return {
    feed: {
      entry: [
        { id: { label: "app-meta" }, title: { label: "App Name" } },
        ...reviews.map((review) => ({
          id: { label: review.id },
          title: { label: review.title },
          content: { label: review.content },
          "im:rating": { label: review.rating },
        })),
      ],
    },
  };
}

/** Minimal batchexecute envelope with one Play review (rpc payload shape). */
function playBatchExecuteBody(reviewId: string, text: string, score: number): string {
  const inner = JSON.stringify([
    [[reviewId, ["Reviewer", null, [null, null, null, null]], score, null, text]],
    null,
  ]);
  const envelope = [[null, null, inner]];
  return `)]}'\n${JSON.stringify(envelope)}`;
}

function sourceFrom(name: string, evidence: readonly EvidenceRef[]): SignalSource {
  return {
    name,
    async collect() {
      return evidence;
    },
  };
}

describe("Store Second Pass adapters (App Store + Play)", () => {
  it("App Store adapter fetches reviews for a mentioned app via iTunes search + RSS", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        const parsed = new URL(url);
        expect(parsed.hostname).toBe("itunes.apple.com");
        if (parsed.pathname === "/search") {
          expect(parsed.searchParams.get("term")).toBe("wave-accounting");
          expect(parsed.searchParams.get("entity")).toBe("software");
          return itunesSearchResult(999001, "Wave Accounting");
        }
        expect(parsed.pathname).toMatch(/\/rss\/customerreviews\//);
        expect(url).toContain("/id=999001/");
        return appStoreReviewsFeed({
          id: "rev-1",
          title: "Reminders fail",
          content: "Invoice reminders never fire on time.",
          rating: "1",
        });
      },
    });

    const store = createAppStoreReviewSource({ http });
    const app: MentionedApp = { id: "wave-accounting", store: "app-store" };
    const evidence = await store.fetchReviews(app);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.signalSource).toBe("app-store");
    expect(evidence[0]!.signalKind).toBe("incumbent-friction");
    expect(evidence[0]!.quote).toContain("Invoice reminders never fire");
    expect(evidence[0]!.url).toContain("apps.apple.com");
    expect(evidence[0]!.structuralKey).toBe("wave-accounting");
    expect(http.getJsonUrls.some((u) => u.includes("/search"))).toBe(true);
    expect(http.getJsonUrls.some((u) => u.includes("customerreviews"))).toBe(
      true,
    );
  });

  it("App Store adapter uses a numeric id directly without search", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        expect(url).toContain("/id=310633997/");
        return appStoreReviewsFeed({
          id: "rev-whatsapp",
          title: "Crash",
          content: "Crashes on open",
          rating: "2",
        });
      },
    });

    const store = createAppStoreReviewSource({ http });
    const evidence = await store.fetchReviews({
      id: "310633997",
      store: "app-store",
    });

    expect(evidence).toHaveLength(1);
    expect(http.getJsonUrls.every((u) => !u.includes("/search"))).toBe(true);
  });

  it("Play adapter fetches reviews for a mentioned package via batchexecute", async () => {
    const http = createScriptedAdapterHttpClient({
      postForm(url, body) {
        expect(url).toContain("play.google.com");
        expect(url).toContain("batchexecute");
        expect(body).toContain("com.wave.accounting");
        return playBatchExecuteBody(
          "gp-rev-1",
          "Play: reminders silently fail in Wave",
          1,
        );
      },
    });

    const store = createPlayStoreReviewSource({ http });
    const evidence = await store.fetchReviews({
      id: "com.wave.accounting",
      store: "play",
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.signalSource).toBe("play");
    expect(evidence[0]!.signalKind).toBe("incumbent-friction");
    expect(evidence[0]!.quote).toContain("reminders silently fail");
    expect(evidence[0]!.url).toContain("play.google.com/store/apps/details");
    expect(evidence[0]!.url).toContain("id=com.wave.accounting");
    expect(evidence[0]!.structuralKey).toBe("com.wave.accounting");
  });

  it("composite StoreReviewSource routes by store and skips the other", async () => {
    const requested: string[] = [];
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        requested.push(`get:${url}`);
        if (url.includes("/search")) {
          return itunesSearchResult(42, "Notion");
        }
        return appStoreReviewsFeed({
          id: "a1",
          title: "Sync broken",
          content: "App Store sync never finishes",
          rating: "1",
        });
      },
      postForm(url, body) {
        requested.push(`post:${url}:${body.slice(0, 40)}`);
        return playBatchExecuteBody("p1", "Play sync is stuck", 1);
      },
    });

    const store = createStoreReviewSource({ http });
    const appStoreEvidence = await store.fetchReviews({
      id: "notion",
      store: "app-store",
    });
    const playEvidence = await store.fetchReviews({
      id: "com.notion.android",
      store: "play",
    });

    expect(appStoreEvidence[0]!.signalSource).toBe("app-store");
    expect(playEvidence[0]!.signalSource).toBe("play");
    expect(requested.some((r) => r.startsWith("get:"))).toBe(true);
    expect(requested.some((r) => r.startsWith("post:"))).toBe(true);
  });

  it("store adapters degrade to empty Evidence when a request fails", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson() {
        throw new Error("itunes down");
      },
      postForm() {
        throw new Error("play down");
      },
    });

    const store = createStoreReviewSource({ http });
    await expect(
      store.fetchReviews({ id: "wave-accounting", store: "app-store" }),
    ).resolves.toEqual([]);
    await expect(
      store.fetchReviews({ id: "com.wave.accounting", store: "play" }),
    ).resolves.toEqual([]);
  });
});

describe("Follow-on adapters (Product Hunt + Indie Hackers + Reddit)", () => {
  it("Product Hunt Follow-on fetches a referenced post by slug via GraphQL", async () => {
    const http = createScriptedAdapterHttpClient({
      postJson(url, body, init) {
        expect(url).toBe("https://api.producthunt.com/v2/api/graphql");
        expect(init?.headers?.Authorization).toBe("Bearer test-token");
        const payload = body as { query: string; variables: { slug: string } };
        expect(payload.variables.slug).toBe("invoice-chaser");
        expect(payload.query).toMatch(/post\s*\(/);
        return {
          data: {
            post: {
              id: "ph-1",
              name: "Invoice Chaser",
              tagline: "Chase late invoices without spreadsheets",
              description: "Built for freelancers drowning in unpaid work.",
              url: "https://www.producthunt.com/posts/invoice-chaser",
            },
          },
        };
      },
    });

    const followOn = createProductHuntFollowOnFetcher({
      http,
      accessToken: "test-token",
    });
    const evidence = await followOn.fetchPage(
      "https://www.producthunt.com/posts/invoice-chaser",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.signalSource).toBe("product-hunt");
    expect(evidence[0]!.quote).toContain("Chase late invoices");
    expect(evidence[0]!.url).toContain("producthunt.com/posts/invoice-chaser");
  });

  it("Product Hunt Follow-on ignores non-post PH URLs and non-PH hosts", async () => {
    const http = createScriptedAdapterHttpClient({
      postJson() {
        throw new Error("should not call GraphQL for non-post URLs");
      },
    });
    const followOn = createProductHuntFollowOnFetcher({
      http,
      accessToken: "test-token",
    });
    await expect(
      followOn.fetchPage("https://news.ycombinator.com/item?id=1"),
    ).resolves.toEqual([]);
    await expect(
      followOn.fetchPage("https://www.producthunt.com/products/invoice-chaser"),
    ).resolves.toEqual([]);
  });

  it("Indie Hackers Follow-on fetches a referenced post page", async () => {
    const http = createScriptedAdapterHttpClient({
      getText(url) {
        expect(url).toBe(
          "https://www.indiehackers.com/post/how-i-stopped-chasing-invoices",
        );
        return `<!doctype html><html><head>
          <title>How I stopped chasing invoices | Indie Hackers</title>
          <meta name="description" content="I still do it in a spreadsheet every Friday." />
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                post: {
                  id: "ih-42",
                  title: "How I stopped chasing invoices",
                  body: "I still do it in a spreadsheet every Friday.",
                },
              },
            },
          })}</script>
        </head><body></body></html>`;
      },
    });

    const followOn = createIndieHackersFollowOnFetcher({ http });
    const evidence = await followOn.fetchPage(
      "https://www.indiehackers.com/post/how-i-stopped-chasing-invoices",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.signalSource).toBe("indie-hackers");
    expect(evidence[0]!.quote).toContain("spreadsheet every Friday");
    expect(evidence[0]!.url).toContain("indiehackers.com/post/");
  });

  it("Indie Hackers Follow-on ignores non-IH URLs", async () => {
    const http = createScriptedAdapterHttpClient({
      getText() {
        throw new Error("should not fetch non-IH URLs");
      },
    });
    const followOn = createIndieHackersFollowOnFetcher({ http });
    await expect(
      followOn.fetchPage("https://www.producthunt.com/posts/x"),
    ).resolves.toEqual([]);
  });

  it("composite Follow-on routes Reddit (via archive), PH, and IH; leaves other URLs empty", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        const parsed = new URL(url);
        expect(parsed.origin).toBe(ARCTIC_SHIFT_API_BASE);
        expect(parsed.pathname).toBe("/api/posts/ids");
        expect(parsed.searchParams.get("ids")).toBe("comp99");
        return {
          data: [
            {
              id: "comp99",
              title: "Composite Reddit deepen",
              selftext: "Archive path, not live reddit.com",
              subreddit: "webdev",
              permalink: "/r/webdev/comments/comp99/composite/",
            },
          ],
        };
      },
      postJson() {
        return {
          data: {
            post: {
              id: "ph-2",
              name: "SH thing",
              tagline: "tag",
              description: "desc",
              url: "https://www.producthunt.com/posts/sh-thing",
            },
          },
        };
      },
      getText() {
        return `<html><head><title>IH post</title>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                post: { id: "ih-1", title: "IH post", body: "Founder pain" },
              },
            },
          })}</script></head></html>`;
      },
    });

    const followOn = createSourceCatalogFollowOnFetcher({
      http,
      productHuntAccessToken: "tok",
    });

    const reddit = await followOn.fetchPage(
      "https://www.reddit.com/r/webdev/comments/comp99/composite/",
    );
    const ph = await followOn.fetchPage(
      "https://www.producthunt.com/posts/sh-thing",
    );
    const ih = await followOn.fetchPage(
      "https://www.indiehackers.com/post/founder-pain",
    );
    const other = await followOn.fetchPage(
      "https://news.ycombinator.com/item?id=99",
    );

    expect(reddit[0]!.signalSource).toBe("reddit");
    expect(reddit[0]!.archivePermalink).toBe(toArchivePermalink("comp99"));
    expect(http.getJsonUrls[0]).toContain("/api/posts/ids");
    expect(http.getJsonUrls[0]).toContain("arctic-shift.photon-reddit.com");
    expect(http.getJsonUrls[0]).not.toMatch(/https?:\/\/(www\.)?reddit\.com\//);
    expect(ph[0]!.signalSource).toBe("product-hunt");
    expect(ih[0]!.signalSource).toBe("indie-hackers");
    expect(other).toEqual([]);
  });
});

describe("Follow-on adapters (Reddit via archive)", () => {
  it("deepens a Reddit post URL through Arctic Shift ids lookup, not live reddit.com", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        const parsed = new URL(url);
        expect(parsed.origin).toBe(ARCTIC_SHIFT_API_BASE);
        expect(parsed.pathname).toBe("/api/posts/ids");
        expect(parsed.searchParams.get("ids")).toBe("abc123");
        return {
          data: [
            {
              id: "abc123",
              title: "wish: invoice follow-up without spreadsheets",
              selftext: "Still chasing clients every Friday.",
              subreddit: "freelance",
              permalink: "/r/freelance/comments/abc123/wish_invoice/",
            },
          ],
        };
      },
    });

    const followOn = createRedditFollowOnFetcher({ http });
    const evidence = await followOn.fetchPage(
      "https://www.reddit.com/r/freelance/comments/abc123/wish_invoice/",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.signalSource).toBe("reddit");
    expect(evidence[0]!.signalKind).toBe("demand-signal");
    expect(evidence[0]!.quote).toContain("chasing clients every Friday");
    expect(evidence[0]!.url).toBe(
      "https://www.reddit.com/r/freelance/comments/abc123/wish_invoice/",
    );
    expect(evidence[0]!.archivePermalink).toBe(
      toArchivePermalink(
        "https://www.reddit.com/r/freelance/comments/abc123/wish_invoice/",
      ),
    );
    expect(http.getJsonUrls).toHaveLength(1);
    expect(http.getJsonUrls[0]).toContain("arctic-shift.photon-reddit.com");
    expect(http.getJsonUrls[0]).not.toMatch(/https?:\/\/(www\.)?reddit\.com\//);
  });

  it("deepens a Reddit comment permalink via comments/ids with Archive Permalink", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        const parsed = new URL(url);
        expect(parsed.pathname).toBe("/api/comments/ids");
        expect(parsed.searchParams.get("ids")).toBe("def456");
        return {
          data: [
            {
              id: "def456",
              body: "The spreadsheet workaround is killing me.",
              subreddit: "smallbusiness",
              link_id: "t3_post99",
              permalink:
                "/r/smallbusiness/comments/post99/thread/def456/",
            },
          ],
        };
      },
    });

    const followOn = createRedditFollowOnFetcher({ http });
    const evidence = await followOn.fetchPage(
      "https://old.reddit.com/r/smallbusiness/comments/post99/thread/def456/",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.id).toBe("reddit-def456");
    expect(evidence[0]!.quote).toContain("spreadsheet workaround");
    expect(evidence[0]!.url).toBe(
      "https://www.reddit.com/r/smallbusiness/comments/post99/thread/def456/",
    );
    expect(evidence[0]!.archivePermalink).toBe(
      toArchivePermalink("t1_def456"),
    );
  });

  it("accepts redd.it short links as Follow-on targets with canonical URL", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        expect(new URL(url).searchParams.get("ids")).toBe("short99");
        return {
          data: [
            {
              id: "short99",
              title: "how do you handle late invoices?",
              selftext: "",
              subreddit: "freelance",
              permalink: "/r/freelance/comments/short99/late/",
            },
          ],
        };
      },
    });

    const followOn = createRedditFollowOnFetcher({ http });
    const evidence = await followOn.fetchPage("https://redd.it/short99");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.url).toBe(
      "https://www.reddit.com/r/freelance/comments/short99/late/",
    );
    expect(evidence[0]!.url).not.toContain("redd.it");
    expect(evidence[0]!.archivePermalink).toBe(toArchivePermalink("short99"));
  });

  it("builds a canonical www.reddit.com URL when archive omits permalink", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson() {
        return {
          data: [
            {
              id: "noperm1",
              title: "wish: less spreadsheet chasing",
              selftext: "Need a real tool",
              subreddit: "smallbusiness",
            },
          ],
        };
      },
    });

    const followOn = createRedditFollowOnFetcher({ http });
    const evidence = await followOn.fetchPage("https://redd.it/noperm1");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.url).toBe(
      "https://www.reddit.com/r/smallbusiness/comments/noperm1/",
    );
    expect(evidence[0]!.archivePermalink).toBe(toArchivePermalink("noperm1"));
  });

  it("ignores non-Reddit URLs without calling the archive", async () => {
    const http = createScriptedAdapterHttpClient({
      getJson() {
        throw new Error("should not call archive for non-Reddit URLs");
      },
    });
    const followOn = createRedditFollowOnFetcher({ http });
    await expect(
      followOn.fetchPage("https://www.indiehackers.com/post/x"),
    ).resolves.toEqual([]);
    expect(http.getJsonUrls).toEqual([]);
  });

  it("degrades with a throw when archive lookup is missing or fails", async () => {
    const missing = createScriptedAdapterHttpClient({
      getJson() {
        return { data: [] };
      },
    });
    await expect(
      createRedditFollowOnFetcher({ http: missing }).fetchPage(
        "https://www.reddit.com/r/webdev/comments/miss01/gone/",
      ),
    ).rejects.toThrow(/Reddit \(via archive\).*miss01|missing|unavailable/i);

    const failed = createScriptedAdapterHttpClient({
      getJson() {
        throw new Error("HTTP 429 for archive");
      },
    });
    await expect(
      createRedditFollowOnFetcher({ http: failed }).fetchPage(
        "https://www.reddit.com/r/webdev/comments/rate01/limited/",
      ),
    ).rejects.toThrow(/Reddit \(via archive\)/);
  });

  it("run notes Reddit Follow-on archive degradation without crashing", async () => {
    const seed: EvidenceRef = {
      id: "hn-seed-reddit-follow-on",
      quote: "Someone linked a thread about this",
      url: "https://news.ycombinator.com/item?id=1",
      signalSource: "hacker-news",
      followOnTargets: [
        {
          url: "https://www.reddit.com/r/freelance/comments/gone99/missing/",
          kind: "demand-signal",
        },
        {
          url: "https://www.indiehackers.com/post/still-works",
          kind: "demand-signal",
        },
      ],
    };

    const http = createScriptedAdapterHttpClient({
      getJson() {
        return { data: [] };
      },
      getText() {
        return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
          {
            props: {
              pageProps: {
                post: {
                  id: "ih-ok",
                  title: "Still works",
                  body: "IH deepen survived archive miss",
                },
              },
            },
          },
        )}</script></html>`;
      },
    });

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("hacker-news", [seed])],
      embeddings: createFixtureEmbeddings(),
      followOnFetcher: createSourceCatalogFollowOnFetcher({ http }),
    });

    const artifact = await miner.run({});
    expect(
      artifact.evidence.some((item) => item.signalSource === "indie-hackers"),
    ).toBe(true);
    expect(
      artifact.sourceDegradationNotes.some(
        (note) =>
          note.includes("Follow-on Fetch degraded") &&
          note.includes("gone99") &&
          note.includes("Reddit (via archive)"),
      ),
    ).toBe(true);
  });
});

describe("Source Catalog composition through run", () => {
  it("cold-start factory still excludes PH/IH as primary Entry Catalog wave", () => {
    const http = createScriptedAdapterHttpClient({
      getJson: () => ({ data: { children: [] }, hits: [] }),
    });
    const sources = createEntryCatalogSignalSources({ http });
    expect(sources.map((s) => s.name)).toEqual(["reddit", "hacker-news"]);
    expect(sources.map((s) => s.name)).not.toContain("product-hunt");
    expect(sources.map((s) => s.name)).not.toContain("indie-hackers");
  });

  it("run combines forum cold start + PH/IH Follow-on + Store Second Pass", async () => {
    const forumSeed: EvidenceRef = {
      id: "reddit-seed",
      quote: "Wave keeps losing reminders; also saw this PH launch and IH post",
      url: "https://www.reddit.com/r/freelance/comments/seed/",
      signalSource: "reddit",
      structuralKey: "wave-reminders",
      followOnTargets: [
        {
          url: "https://www.producthunt.com/posts/wave-ish",
          kind: "alternative-review",
        },
        {
          url: "https://www.indiehackers.com/post/invoice-pain",
          kind: "demand-signal",
        },
      ],
      mentionedApps: [
        { id: "wave-accounting", store: "app-store" },
        { id: "com.wave.accounting", store: "play" },
      ],
    };

    const http = createScriptedAdapterHttpClient({
      getJson(url) {
        if (url.includes("itunes.apple.com/search")) {
          return itunesSearchResult(777, "Wave");
        }
        if (url.includes("customerreviews")) {
          return appStoreReviewsFeed({
            id: "as-1",
            title: "Broken",
            content: "App Store: Wave reminders never fire",
            rating: "1",
          });
        }
        throw new Error(`Unexpected getJson in combined run: ${url}`);
      },
      postForm(_url, body) {
        expect(body).toContain("com.wave.accounting");
        return playBatchExecuteBody(
          "pl-1",
          "Play: Wave reminders never fire",
          1,
        );
      },
      postJson() {
        return {
          data: {
            post: {
              id: "ph-wave",
              name: "Wave-ish",
              tagline: "Accounting launch",
              description: "PH page about Wave-like invoicing",
              url: "https://www.producthunt.com/posts/wave-ish",
            },
          },
        };
      },
      getText() {
        return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
          {
            props: {
              pageProps: {
                post: {
                  id: "ih-inv",
                  title: "Invoice pain",
                  body: "IH: still chasing invoices manually",
                },
              },
            },
          },
        )}</script></html>`;
      },
    });

    const miner = createPainPointMiner({
      signalSources: [sourceFrom("reddit", [forumSeed])],
      embeddings: createFixtureEmbeddings(),
      followOnFetcher: createSourceCatalogFollowOnFetcher({
        http,
        productHuntAccessToken: "tok",
      }),
      storeReviewSource: createStoreReviewSource({ http }),
    });

    const artifact = await miner.run({});
    const sources = new Set(artifact.evidence.map((e) => e.signalSource));

    expect(sources.has("reddit")).toBe(true);
    expect(sources.has("product-hunt")).toBe(true);
    expect(sources.has("indie-hackers")).toBe(true);
    expect(sources.has("app-store")).toBe(true);
    expect(sources.has("play")).toBe(true);

    // Demand-signal IH before alternative-review PH
    const ihIndex = artifact.evidence.findIndex(
      (e) => e.signalSource === "indie-hackers",
    );
    const phIndex = artifact.evidence.findIndex(
      (e) => e.signalSource === "product-hunt",
    );
    expect(ihIndex).toBeGreaterThan(-1);
    expect(phIndex).toBeGreaterThan(-1);
    expect(ihIndex).toBeLessThan(phIndex);

    // Store pass only for apps mentioned on forum Evidence
    expect(
      artifact.evidence.some((e) => e.signalSource === "app-store"),
    ).toBe(true);
    expect(artifact.evidence.some((e) => e.signalSource === "play")).toBe(true);

    // PH/IH never appear as cold-start SignalSource names in this composition
    expect(http.postJsonUrls.every((u) => u.includes("producthunt"))).toBe(
      true,
    );
    expect(
      http.getTextUrls.every((u) => u.includes("indiehackers.com")),
    ).toBe(true);
  });
});
