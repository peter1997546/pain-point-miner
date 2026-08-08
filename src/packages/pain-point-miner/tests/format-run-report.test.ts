import { describe, expect, it } from "vitest";
import {
  formatRunReport,
  type Brief,
  type EvidenceRef,
  type HollowRejection,
} from "../index.js";

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    clusterId: "cluster-invoice",
    painPointSummary:
      "Freelancers lose Fridays chasing late invoices in spreadsheets.",
    evidenceLinks: [
      "https://reddit.com/r/freelance/comments/fixture-invoice-chase",
    ],
    targetMarket: "Freelance bookkeepers in Hong Kong",
    competitiveLandscape:
      "Local bookkeeping SaaS with moderate penetration; reminder workflows are weak.",
    statusQuoSpendSignals: "Spreadsheet + weekend chase time; some pay for Wave.",
    deliveryCost: "Model calls for reminder drafting; light ops.",
    difficulty: "M",
    signalMix: { demandSignalCount: 4, incumbentFrictionCount: 1 },
    competitionDensity: 0.35,
    ...overrides,
  };
}

function hollow(overrides: Partial<HollowRejection> = {}): HollowRejection {
  return {
    clusterId: "cluster-wish",
    reason:
      "Wish-only platitudes with no concrete scene, workaround, or observable failure.",
    signalMix: { demandSignalCount: 5, incumbentFrictionCount: 0 },
    ...overrides,
  };
}

const invoiceEvidence: EvidenceRef = {
  id: "reddit-1",
  quote:
    "I wish there was a tool that tracked client invoices and chased late payments for freelancers.",
  url: "https://reddit.com/r/freelance/comments/fixture-invoice-chase",
  signalSource: "reddit",
};

describe("formatRunReport — Seam C Run Report Markdown", () => {
  it("maps light metadata into a Builder-readable Run Report (not a RunArtifact dump)", () => {
    const markdown = formatRunReport({
      briefs: [],
      hollowRejections: [],
      meta: {
        runId: ".pain-point-miner/runs/2026-08-08T19-00-00Z",
        intent: { theme: "AI automation" },
        saturationStopped: false,
      },
    });

    expect(markdown).toContain("# Pain Point Miner Run Report");
    expect(markdown).toContain(
      ".pain-point-miner/runs/2026-08-08T19-00-00Z",
    );
    expect(markdown).toContain("AI automation");
    expect(markdown).toMatch(/Saturation Stopped:\s*\*\*no\*\*/i);
    expect(markdown).not.toContain("# Pain Point Miner RunArtifact");
    expect(markdown).not.toContain("## Candidate Clusters");
  });

  it("renders required Brief fields and Evidence links/quotes only from provided outcomes", () => {
    const sample = brief();
    const markdown = formatRunReport({
      briefs: [sample],
      hollowRejections: [],
      meta: {
        runId: "run-brief-1",
        intent: {},
        saturationStopped: true,
      },
      evidence: [invoiceEvidence],
    });

    expect(markdown).toContain("## Pain Point Briefs");
    expect(markdown).toContain(sample.painPointSummary);
    expect(markdown).toContain(sample.targetMarket);
    expect(markdown).toContain(sample.competitiveLandscape);
    expect(markdown).toContain(sample.statusQuoSpendSignals);
    expect(markdown).toContain(sample.deliveryCost);
    expect(markdown).toContain("Difficulty");
    expect(markdown).toContain(sample.difficulty);
    expect(markdown).toContain("Competition density");
    expect(markdown).toContain(String(sample.competitionDensity));
    expect(markdown).toContain("Signal Mix");
    expect(markdown).toContain(
      "https://reddit.com/r/freelance/comments/fixture-invoice-chase",
    );
    expect(markdown).toContain(invoiceEvidence.quote);
    // Formatter must not invent Evidence URLs absent from outcomes.
    expect(markdown).not.toContain("https://invented.example/not-from-outcomes");
    expect(markdown).toMatch(/Saturation Stopped:\s*\*\*yes\*\*/i);
  });

  it("renders Hollow rejection reasons without inventing Evidence", () => {
    const rejection = hollow();
    const markdown = formatRunReport({
      briefs: [],
      hollowRejections: [rejection],
      meta: {
        runId: "run-hollow-1",
        intent: {},
        saturationStopped: false,
      },
    });

    expect(markdown).toContain("## Hollow rejections");
    expect(markdown).toContain(rejection.clusterId);
    expect(markdown).toContain(rejection.reason);
    expect(markdown).not.toContain("https://invented.example/");
  });

  it("surfaces source degradation notes and a summary table for the Builder", () => {
    const markdown = formatRunReport({
      briefs: [brief()],
      hollowRejections: [hollow()],
      meta: {
        runId: "run-notes-1",
        intent: {
          productShape: "solo-dev SaaS",
          hardNos: "no marketplace",
        },
        saturationStopped: false,
        sourceDegradationNotes: [
          "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
          "Store Second Pass degraded for app store:timeout",
        ],
      },
      evidence: [invoiceEvidence],
    });

    expect(markdown).toContain("## Source notes");
    expect(markdown).toContain(
      "Product Hunt Follow-on skipped (PRODUCT_HUNT_TOKEN unset)",
    );
    expect(markdown).toContain(
      "Store Second Pass degraded for app store:timeout",
    );
    expect(markdown).toContain("solo-dev SaaS");
    expect(markdown).toContain("no marketplace");
    // Useful summary table (counts), not a raw artifact dump.
    expect(markdown).toMatch(/\|?\s*Briefs\s*\|?\s*1/i);
    expect(markdown).toMatch(/\|?\s*Hollow rejections\s*\|?\s*1/i);
  });

  it("omits Evidence quotes when no matching Evidence was provided (still lists Brief links)", () => {
    const sample = brief({
      evidenceLinks: ["https://example.com/only-link"],
    });
    const markdown = formatRunReport({
      briefs: [sample],
      hollowRejections: [],
      meta: {
        runId: "run-link-only",
        intent: {},
        saturationStopped: false,
      },
      // Unrelated Evidence — must not be quoted onto this Brief.
      evidence: [invoiceEvidence],
    });

    expect(markdown).toContain("https://example.com/only-link");
    expect(markdown).not.toContain(invoiceEvidence.quote);
    expect(markdown).not.toContain(invoiceEvidence.url);
  });
});
