import { describe, expect, it } from "vitest";
import {
  ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS,
  ENTRY_CATALOG_HN_ASK_QUERIES,
  ENTRY_CATALOG_REDDIT_BOARDS,
  ENTRY_CATALOG_REDDIT_DEMAND_QUERIES,
  createEntryCatalogSignalSources,
  createFixtureEmbeddings,
  createHackerNewsSignalSource,
  createPainPointMiner,
  createRedditSignalSource,
  type JsonHttpClient,
} from "../index.js";

/**
 * Seams under test (ticket #10 / ADR-0010):
 * - SignalSource.collect for Reddit + HN Entry Catalog adapters
 * - Injectable JsonHttpClient (recordings — no live network in CI)
 * - createPainPointMiner({ signalSources }) — same port, no second public seam
 * - Cold-start composition: primary boards/queries only (founder / PH / IH out)
 */

function createScriptedHttpClient(
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

function redditListing(...posts: { id: string; title: string; subreddit: string; selftext?: string }[]) {
  return {
    data: {
      children: posts.map((post) => ({
        data: {
          id: post.id,
          title: post.title,
          selftext: post.selftext ?? "",
          subreddit: post.subreddit,
          permalink: `/r/${post.subreddit}/comments/${post.id}/fixture/`,
        },
      })),
    },
  };
}

function hnHits(
  ...hits: { objectID: string; title: string; story_text?: string }[]
) {
  return {
    hits: hits.map((hit) => ({
      objectID: hit.objectID,
      title: hit.title,
      story_text: hit.story_text ?? "",
    })),
  };
}

describe("Entry Catalog adapters (Reddit + HN)", () => {
  it("lists ADR-0010 primary Reddit boards and demand queries; deprioritizes founder boards", () => {
    expect([...ENTRY_CATALOG_REDDIT_BOARDS]).toEqual([
      "smallbusiness",
      "freelance",
      "sysadmin",
      "webdev",
      "sales",
      "marketing",
      "ecommerce",
    ]);
    expect([...ENTRY_CATALOG_REDDIT_DEMAND_QUERIES]).toEqual([
      "wish",
      "tool for",
      "why no",
      "spreadsheet workaround",
      "how do you handle",
    ]);
    expect([...ENTRY_CATALOG_HN_ASK_QUERIES].length).toBeGreaterThan(0);
    expect(ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS).toContain("Entrepreneur");
    for (const board of ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS) {
      expect(ENTRY_CATALOG_REDDIT_BOARDS).not.toContain(board);
    }
  });

  it("Reddit Signal Source mines primary boards with demand queries from recordings", async () => {
    const http = createScriptedHttpClient((url) => {
      const parsed = new URL(url);
      expect(parsed.hostname).toBe("www.reddit.com");
      const match = parsed.pathname.match(/^\/r\/([^/]+)\/search\.json$/);
      expect(match).not.toBeNull();
      const board = match![1]!;
      expect(ENTRY_CATALOG_REDDIT_BOARDS).toContain(board);
      expect(ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS).not.toContain(board);
      const query = parsed.searchParams.get("q") ?? "";
      expect(ENTRY_CATALOG_REDDIT_DEMAND_QUERIES).toContain(query);
      expect(parsed.searchParams.get("restrict_sr")).toBe("1");
      const slug = query.replace(/\s+/g, "-");

      return redditListing({
        id: `${board}-${slug}-1`,
        title: `${query}: need something better for ${board}`,
        subreddit: board,
        selftext: "Still stuck in a spreadsheet workaround.",
      });
    });

    const reddit = createRedditSignalSource({ http });
    expect(reddit.name).toBe("reddit");

    const evidence = await reddit.collect();

    expect(evidence.length).toBe(
      ENTRY_CATALOG_REDDIT_BOARDS.length *
        ENTRY_CATALOG_REDDIT_DEMAND_QUERIES.length,
    );
    for (const board of ENTRY_CATALOG_REDDIT_BOARDS) {
      const fromBoard = evidence.filter((item) =>
        item.url.includes(`/r/${board}/`),
      );
      expect(fromBoard.length).toBe(ENTRY_CATALOG_REDDIT_DEMAND_QUERIES.length);
      for (const item of fromBoard) {
        expect(item.signalSource).toBe("reddit");
        expect(item.quote.length).toBeGreaterThan(0);
        expect(item.url).toMatch(/^https:\/\/www\.reddit\.com\/r\//);
      }
    }
    for (const url of http.requestedUrls) {
      expect(url).not.toMatch(/\/r\/Entrepreneur\//i);
      expect(url).not.toMatch(/producthunt|indiehackers|indie-hackers/i);
    }
  });

  it("HN Signal Source mines Ask HN–style frustration / wish searches from recordings", async () => {
    const http = createScriptedHttpClient((url) => {
      const parsed = new URL(url);
      expect(parsed.hostname).toBe("hn.algolia.com");
      expect(parsed.pathname).toBe("/api/v1/search");
      expect(parsed.searchParams.get("tags")).toBe("ask_hn");
      const query = parsed.searchParams.get("query") ?? "";
      expect(ENTRY_CATALOG_HN_ASK_QUERIES).toContain(query);
      const slug = query.replace(/\s+/g, "-");
      return hnHits({
        objectID: `hn-${slug}`,
        title: `Ask HN: ${query} without drowning in spreadsheets?`,
        story_text: "Looking for a real workaround, not another SaaS roundup.",
      });
    });

    const hn = createHackerNewsSignalSource({ http });
    expect(hn.name).toBe("hacker-news");

    const evidence = await hn.collect();

    expect(evidence.length).toBe(ENTRY_CATALOG_HN_ASK_QUERIES.length);
    for (const item of evidence) {
      expect(item.signalSource).toBe("hacker-news");
      expect(item.quote).toMatch(/^Ask HN:/);
      expect(item.url).toMatch(
        /^https:\/\/news\.ycombinator\.com\/item\?id=/,
      );
    }
    for (const url of http.requestedUrls) {
      expect(url).not.toMatch(/producthunt|indiehackers|indie-hackers/i);
    }
  });

  it("skips a failed catalog request and still returns Evidence from the rest", async () => {
    const http = createScriptedHttpClient((url) => {
      const parsed = new URL(url);
      if (parsed.hostname === "www.reddit.com") {
        const board = parsed.pathname.match(/^\/r\/([^/]+)\//)?.[1] ?? "";
        if (board === "freelance") {
          throw new Error("simulated reddit outage");
        }
        return redditListing({
          id: `${board}-ok`,
          title: `wish on ${board}`,
          subreddit: board,
        });
      }
      return hnHits({
        objectID: "hn-ok",
        title: "Ask HN: I wish inventory was easier",
      });
    });

    const sources = createEntryCatalogSignalSources({ http });
    const reddit = await sources[0]!.collect();
    const hn = await sources[1]!.collect();

    expect(reddit.every((item) => !item.url.includes("/r/freelance/"))).toBe(
      true,
    );
    expect(reddit.some((item) => item.url.includes("/r/webdev/"))).toBe(true);
    expect(hn.length).toBeGreaterThan(0);
  });

  it("Reddit Evidence extracts PH/IH Follow-on URLs and store app links from post text", async () => {
    const http = createScriptedHttpClient((url) => {
      const parsed = new URL(url);
      if (parsed.hostname !== "www.reddit.com") {
        return { hits: [] };
      }
      const board = parsed.pathname.match(/^\/r\/([^/]+)\//)?.[1] ?? "webdev";
      return redditListing({
        id: `${board}-links`,
        title: "wish: better invoicing",
        subreddit: board,
        selftext:
          "Saw https://www.producthunt.com/posts/wave-ish and https://www.indiehackers.com/post/invoice-pain plus https://apps.apple.com/us/app/wave/id999001 and https://play.google.com/store/apps/details?id=com.wave.accounting",
      });
    });

    const reddit = createRedditSignalSource({ http });
    const evidence = await reddit.collect();
    const withHints = evidence.find((item) =>
      item.quote.includes("producthunt.com"),
    );
    expect(withHints).toBeDefined();
    expect(withHints!.followOnTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.producthunt.com/posts/wave-ish",
          kind: "alternative-review",
        }),
        expect.objectContaining({
          url: "https://www.indiehackers.com/post/invoice-pain",
          kind: "demand-signal",
        }),
      ]),
    );
    expect(withHints!.mentionedApps).toEqual(
      expect.arrayContaining([
        { id: "999001", store: "app-store" },
        { id: "com.wave.accounting", store: "play" },
      ]),
    );
  });

  it("cold-start factory wires Reddit + HN into run without founder boards or PH/IH", async () => {
    const http = createScriptedHttpClient((url) => {
      const parsed = new URL(url);
      if (parsed.hostname === "www.reddit.com") {
        const match = parsed.pathname.match(/^\/r\/([^/]+)\/search\.json$/);
        const board = match?.[1] ?? "unknown";
        const query = parsed.searchParams.get("q") ?? "q";
        return redditListing({
          id: `${board}-${query.replace(/\s+/g, "-")}`,
          title: `wish: ${board}`,
          subreddit: board,
        });
      }
      if (parsed.hostname === "hn.algolia.com") {
        const query = parsed.searchParams.get("query") ?? "q";
        return hnHits({
          objectID: `ask-${query.replace(/\s+/g, "-")}`,
          title: `Ask HN: ${query}`,
        });
      }
      throw new Error(`Unexpected host in cold-start: ${parsed.hostname}`);
    });

    const signalSources = createEntryCatalogSignalSources({ http });
    expect(signalSources.map((source) => source.name)).toEqual([
      "reddit",
      "hacker-news",
    ]);

    const miner = createPainPointMiner({
      signalSources,
      embeddings: createFixtureEmbeddings(),
    });
    const artifact = await miner.run({});

    expect(artifact.evidence.some((item) => item.signalSource === "reddit")).toBe(
      true,
    );
    expect(
      artifact.evidence.some((item) => item.signalSource === "hacker-news"),
    ).toBe(true);
    expect(
      artifact.evidence.every(
        (item) =>
          item.signalSource === "reddit" || item.signalSource === "hacker-news",
      ),
    ).toBe(true);
    for (const url of http.requestedUrls) {
      expect(url).not.toMatch(/\/r\/Entrepreneur\//i);
      expect(url).not.toMatch(/producthunt|indiehackers|indie-hackers/i);
    }
  });
});
