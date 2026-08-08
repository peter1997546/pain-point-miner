import type { EvidenceRef, SignalSource } from "./types.js";
import { mentionedAppKey } from "./types.js";
import {
  createFixtureFollowOnFetcher,
  createFixtureStoreReviewSource,
} from "./fixture-follow-on-store.js";

/** Built-in fixture Evidence for local Script inspection without the network. */
export const defaultFixtureEvidence: readonly EvidenceRef[] = [
  {
    id: "reddit-1",
    quote:
      "I wish there was a tool that tracked client invoices and chased late payments for freelancers. Also seeing Wave drop reminders.",
    url: "https://reddit.com/r/freelance/comments/fixture-invoice-chase",
    signalSource: "reddit",
    followOnTargets: [
      {
        url: "https://news.ycombinator.com/item?id=fixture-invoice-ask",
        kind: "demand-signal",
      },
      {
        url: "https://example.com/best-alternatives-to-wave",
        kind: "alternative-review",
      },
    ],
    mentionedApps: [{ id: "wave-accounting", store: "app-store" }],
  },
  {
    id: "hn-1",
    quote:
      "Ask HN: How do you handle inventory for a tiny ecommerce shop without a spreadsheet nightmare?",
    url: "https://news.ycombinator.com/item?id=fixture-inventory",
    signalSource: "hacker-news",
  },
];

/** Fixture Follow-on pages for the default Script CLI path (no live network). */
export const defaultFixtureFollowOnPages: Record<
  string,
  readonly EvidenceRef[]
> = {
  "https://news.ycombinator.com/item?id=fixture-invoice-ask": [
    {
      id: "hn-follow-invoice",
      quote:
        "Ask HN follow-up: freelancers still manually chasing unpaid invoices every Friday.",
      url: "https://news.ycombinator.com/item?id=fixture-invoice-ask",
      signalSource: "hacker-news",
    },
  ],
  "https://example.com/best-alternatives-to-wave": [
    {
      id: "alt-wave-roundup",
      quote: "Roundup of Wave alternatives for freelancers (review-style page).",
      url: "https://example.com/best-alternatives-to-wave",
      signalSource: "product-hunt",
    },
  ],
};

/** Fixture store reviews keyed for apps mentioned in default forum Evidence. */
export const defaultFixtureStoreReviews: Record<
  string,
  readonly EvidenceRef[]
> = {
  [mentionedAppKey({ id: "wave-accounting", store: "app-store" })]: [
    {
      id: "app-store-wave-1",
      quote: "App Store: Wave invoice reminders never fire on time.",
      url: "https://apps.apple.com/app/wave/id-fixture",
      signalSource: "app-store",
    },
  ],
};

export function createFixtureSignalSources(
  evidence: readonly EvidenceRef[] = defaultFixtureEvidence,
): SignalSource[] {
  const bySource = new Map<string, EvidenceRef[]>();
  for (const item of evidence) {
    const list = bySource.get(item.signalSource) ?? [];
    list.push(item);
    bySource.set(item.signalSource, list);
  }

  return [...bySource.entries()].map(([name, items]) => ({
    name,
    async collect() {
      return items;
    },
  }));
}

export function createDefaultFixtureFollowOnFetcher() {
  return createFixtureFollowOnFetcher(defaultFixtureFollowOnPages);
}

export function createDefaultFixtureStoreReviewSource() {
  return createFixtureStoreReviewSource(defaultFixtureStoreReviews);
}
