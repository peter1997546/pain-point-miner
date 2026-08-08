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

  lines.push("## Evidence", "");
  if (artifact.evidence.length === 0) {
    lines.push("_No Evidence collected._", "");
  } else {
    for (const [index, item] of artifact.evidence.entries()) {
      lines.push(
        `### ${index + 1}. \`${item.id}\` (${item.signalSource})`,
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
