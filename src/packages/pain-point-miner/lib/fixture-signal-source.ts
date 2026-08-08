import type { EvidenceRef, SignalSource } from "./types.js";

/** Built-in fixture Evidence for local Script inspection without the network. */
export const defaultFixtureEvidence: readonly EvidenceRef[] = [
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
