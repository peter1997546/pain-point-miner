import type {
  Brief,
  EvidenceRef,
  HollowRejection,
  Intent,
  SignalMix,
} from "./types.js";

/** Light run metadata surfaced in the Builder-facing Run Report. */
export type RunReportMeta = {
  /** Time-based run folder identity (e.g. `.pain-point-miner/runs/<timestamp>`). */
  runId: string;
  intent: Intent;
  saturationStopped: boolean;
  /**
   * Skipped or degraded live sources (token-gated Follow-on, fetch failures).
   * Omitted / empty means no degradation notes to show.
   */
  sourceDegradationNotes?: readonly string[];
};

/**
 * Inputs for the pure Run Report Markdown formatter (Seam C / ADR-0015).
 * Briefs and Hollow rejections are Analysis outcomes — the formatter does not
 * re-judge them. Optional `evidence` supplies quotes only for links already
 * present on Briefs; nothing is invented.
 */
export type FormatRunReportInput = {
  briefs: readonly Brief[];
  hollowRejections: readonly HollowRejection[];
  meta: RunReportMeta;
  /**
   * Evidence refs the Report Agent supplies from Analysis outcomes.
   * Used only to attach quotes to Brief `evidenceLinks` that match by URL.
   */
  evidence?: readonly EvidenceRef[];
};

function formatSignalMix(mix: SignalMix): string {
  return `Demand Signal ${mix.demandSignalCount} / Incumbent Friction ${mix.incumbentFrictionCount}`;
}

function formatIntent(intent: Intent): string[] {
  const entries = Object.entries(intent).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0,
  );
  if (entries.length === 0) {
    return ["_(empty — documented default)_", ""];
  }
  const lines: string[] = [];
  for (const [key, value] of entries) {
    lines.push(`- **${key}**: ${value}`);
  }
  lines.push("");
  return lines;
}

type EvidenceLookup = {
  byUrl: Map<string, EvidenceRef>;
  byArchivePermalink: Map<string, EvidenceRef>;
};

function evidenceLookup(
  evidence: readonly EvidenceRef[] | undefined,
): EvidenceLookup {
  const byUrl = new Map<string, EvidenceRef>();
  const byArchivePermalink = new Map<string, EvidenceRef>();
  for (const item of evidence ?? []) {
    byUrl.set(item.url, item);
    if (item.archivePermalink) {
      byArchivePermalink.set(item.archivePermalink, item);
    }
  }
  return { byUrl, byArchivePermalink };
}

function resolveEvidence(
  link: string,
  lookup: EvidenceLookup,
): EvidenceRef | undefined {
  return lookup.byUrl.get(link) ?? lookup.byArchivePermalink.get(link);
}

/**
 * Emit Builder-facing Evidence links. When an Archive Permalink is present on
 * matching Reddit Evidence, it is required in the deliverable (ADR-0016);
 * the canonical Reddit URL may also appear, labeled for distinguishability.
 * Quote association resolves via canonical URL or Archive Permalink.
 */
function formatEvidenceLinks(
  brief: Brief,
  lookup: EvidenceLookup,
): string[] {
  const lines: string[] = [];
  const emitted = new Set<string>();

  for (const link of brief.evidenceLinks) {
    const match = resolveEvidence(link, lookup);
    if (!match) {
      if (!emitted.has(link)) {
        emitted.add(link);
        lines.push(`- ${link}`);
      }
      continue;
    }

    const openLink = match.archivePermalink ?? match.url;
    if (emitted.has(openLink)) {
      continue;
    }
    emitted.add(openLink);
    lines.push(`- ${openLink}`);
    if (
      match.archivePermalink &&
      match.url !== match.archivePermalink &&
      !emitted.has(`canonical:${match.url}`)
    ) {
      emitted.add(`canonical:${match.url}`);
      lines.push(`  - Canonical: ${match.url}`);
    }
    lines.push(`  > ${match.quote}`);
  }

  return lines;
}

function formatBriefSection(
  brief: Brief,
  index: number,
  lookup: EvidenceLookup,
): string[] {
  const lines: string[] = [
    `### ${index + 1}. \`${brief.clusterId}\` — ${brief.painPointSummary}`,
    "",
    `| Field | Detail |`,
    `| --- | --- |`,
    `| **Pain Point** | ${brief.painPointSummary} |`,
    `| **Target Market** | ${brief.targetMarket} |`,
    `| **Competitive Landscape** | ${brief.competitiveLandscape} |`,
    `| **Status-quo spend** | ${brief.statusQuoSpendSignals} |`,
    `| **Delivery Cost** | ${brief.deliveryCost} |`,
    `| **Difficulty** | ${brief.difficulty} |`,
    `| **Signal Mix** | ${formatSignalMix(brief.signalMix)} |`,
    `| **Competition density** | ${brief.competitionDensity} |`,
    "",
    "**Evidence**",
    "",
  ];

  if (brief.evidenceLinks.length === 0) {
    lines.push("_No Evidence links on this Brief._", "");
    return lines;
  }

  lines.push(...formatEvidenceLinks(brief, lookup), "");
  return lines;
}

function formatHollowSection(rejection: HollowRejection): string[] {
  return [
    `### \`${rejection.clusterId}\``,
    "",
    `- **Reason**: ${rejection.reason}`,
    `- **Signal Mix**: ${formatSignalMix(rejection.signalMix)}`,
    "",
  ];
}

/**
 * Pure formatter: Analysis outcomes + light metadata → polished Markdown
 * Run Report skeleton for the Report Agent (ADR-0015).
 */
export function formatRunReport(input: FormatRunReportInput): string {
  const { briefs, hollowRejections, meta } = input;
  const lookup = evidenceLookup(input.evidence);
  const notes = meta.sourceDegradationNotes ?? [];

  const lines: string[] = [
    "# Pain Point Miner Run Report",
    "",
    "## Run",
    "",
    `- Run id: \`${meta.runId}\``,
    `- Saturation Stopped: **${meta.saturationStopped ? "yes" : "no"}**`,
    "",
    "## Intent",
    "",
    ...formatIntent(meta.intent),
    "## Source notes",
    "",
  ];

  if (notes.length === 0) {
    lines.push("_No source degradations noted._", "");
  } else {
    for (const note of notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  lines.push(
    "## Summary",
    "",
    "| Kind | Count |",
    "| --- | ---: |",
    `| Briefs | ${briefs.length} |`,
    `| Hollow rejections | ${hollowRejections.length} |`,
    "",
    "## Pain Point Briefs",
    "",
  );

  if (briefs.length === 0) {
    lines.push("_No Pain Point Briefs._", "");
  } else {
    for (const [index, item] of briefs.entries()) {
      lines.push(...formatBriefSection(item, index, lookup));
    }
  }

  lines.push("## Hollow rejections", "");
  if (hollowRejections.length === 0) {
    lines.push("_No Hollow rejections._", "");
  } else {
    for (const rejection of hollowRejections) {
      lines.push(...formatHollowSection(rejection));
    }
  }

  return `${lines.join("\n")}\n`;
}
