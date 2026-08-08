import type { RunArtifact } from "./types.js";

export type ArtifactFormat = "json" | "markdown";

export function formatRunArtifact(
  artifact: RunArtifact,
  format: ArtifactFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(artifact, null, 2)}\n`;
  }

  const lines: string[] = [
    "# Pain Point Miner RunArtifact",
    "",
    "## Intent",
    "",
  ];

  const intentEntries = Object.entries(artifact.intent);
  if (intentEntries.length === 0) {
    lines.push("_(empty — documented default)_", "");
  } else {
    for (const [key, value] of intentEntries) {
      lines.push(`- **${key}**: ${value}`);
    }
    lines.push("");
  }

  lines.push(
    "## Count Gate / Saturation Stop",
    "",
    `- Gated Candidate Clusters (analysis-ready): **${artifact.gatedClusters.length}**`,
    `- Saturation Stopped: **${artifact.saturationStopped ? "yes" : "no"}**`,
    "",
    "## Candidate Clusters",
    "",
  );

  if (artifact.candidateClusters.length === 0) {
    lines.push("_No Candidate Clusters._", "");
  } else {
    for (const cluster of artifact.candidateClusters) {
      const gateLabel = cluster.passedCountGate
        ? "passed Count Gate"
        : "below Count Gate (not analysis-ready)";
      const mix = cluster.signalMix;
      lines.push(
        `### \`${cluster.id}\` — Evidence Count ${cluster.evidenceCount} — ${gateLabel}`,
        "",
        `- Signal Mix: Demand Signal ${mix.demandSignalCount} / Incumbent Friction ${mix.incumbentFrictionCount}`,
        "",
      );
      for (const item of cluster.evidence) {
        const kindLabel = item.signalKind ? ` [${item.signalKind}]` : "";
        lines.push(
          `- \`${item.id}\` (${item.signalSource})${kindLabel}: ${item.url}`,
          `  > ${item.quote}`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Analysis Pass", "");
  if (artifact.analysisOutcomes.length === 0) {
    lines.push("_No Analysis Pass outcomes (port omitted or no gated clusters)._", "");
  } else {
    lines.push(
      `- Pain Point Briefs: **${artifact.briefs.length}**`,
      `- Hollow rejections: **${artifact.hollowRejections.length}**`,
      `- Visible after Competition Filter: **${artifact.visibleBriefs.length}**`,
      `- Hidden by Competition Filter: **${artifact.hiddenByCompetitionFilter.length}**`,
      "",
    );
  }

  if (artifact.hollowRejections.length > 0) {
    lines.push("## Hollow rejections", "");
    for (const rejection of artifact.hollowRejections) {
      lines.push(
        `### \`${rejection.clusterId}\``,
        "",
        `- Reason: ${rejection.reason}`,
        `- Signal Mix: Demand ${rejection.signalMix.demandSignalCount} / Incumbent ${rejection.signalMix.incumbentFrictionCount}`,
        "",
      );
    }
  }

  if (artifact.briefs.length > 0) {
    lines.push("## Pain Point Briefs", "");
    for (const brief of artifact.briefs) {
      const hidden = artifact.hiddenByCompetitionFilter.some(
        (item) => item.clusterId === brief.clusterId,
      );
      lines.push(
        `### \`${brief.clusterId}\`${hidden ? " _(hidden by Competition Filter)_" : ""}`,
        "",
        `- **Pain Point**: ${brief.painPointSummary}`,
        `- **Target Market**: ${brief.targetMarket}`,
        `- **Competitive Landscape**: ${brief.competitiveLandscape}`,
        `- **Status-quo spend**: ${brief.statusQuoSpendSignals}`,
        `- **Delivery Cost**: ${brief.deliveryCost}`,
        `- **Difficulty**: ${brief.difficulty}`,
        `- **Signal Mix**: Demand ${brief.signalMix.demandSignalCount} / Incumbent ${brief.signalMix.incumbentFrictionCount}`,
        `- **Competition density**: ${brief.competitionDensity}`,
        `- **Evidence links**:`,
      );
      for (const link of brief.evidenceLinks) {
        lines.push(`  - ${link}`);
      }
      lines.push("");
    }
  }

  lines.push("## Evidence", "");
  if (artifact.evidence.length === 0) {
    lines.push("_No Evidence collected._", "");
  } else {
    for (const [index, item] of artifact.evidence.entries()) {
      const kindLabel = item.signalKind ? ` [${item.signalKind}]` : "";
      lines.push(
        `### ${index + 1}. \`${item.id}\` (${item.signalSource})${kindLabel}`,
        "",
        `> ${item.quote}`,
        "",
        `- Link: ${item.url}`,
        "",
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
