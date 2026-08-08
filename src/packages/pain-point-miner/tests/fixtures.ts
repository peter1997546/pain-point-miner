import {
  createFixtureSignalSources,
  type EvidenceRef,
} from "../index.js";

/** Known-good Evidence literals for behavioral tests (independent of production defaults). */
export const knownEvidence: readonly EvidenceRef[] = [
  {
    id: "reddit-1",
    quote:
      "I wish there was a tool that tracked client invoices and chased late payments for freelancers.",
    url: "https://reddit.com/r/freelance/comments/fixture-invoice-chase",
    signalSource: "reddit",
  },
  {
    id: "hn-1",
    quote:
      "Ask HN: How do you handle inventory for a tiny ecommerce shop without a spreadsheet nightmare?",
    url: "https://news.ycombinator.com/item?id=fixture-inventory",
    signalSource: "hacker-news",
  },
];

export function createTestSignalSources() {
  return createFixtureSignalSources(knownEvidence);
}
