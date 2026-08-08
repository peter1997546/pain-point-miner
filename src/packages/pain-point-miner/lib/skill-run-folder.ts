import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatRunReport } from "./format-run-report.js";
import { partitionAnalysisOutcomes } from "./partition-analysis-outcomes.js";
import type { SkillMiningHandoff } from "./skill-mining-handoff.js";
import type { AnalysisOutcome, EvidenceRef } from "./types.js";

export const DEFAULT_SKILL_RUNS_ROOT = ".pain-point-miner/runs";

export type CreateSkillRunFolderPathOptions = {
  /** Root for time-based run folders; default `.pain-point-miner/runs`. */
  runsRoot?: string;
  /** Clock inject for tests; default `new Date()`. */
  now?: Date;
};

/**
 * Time-based Skill run folder path (e.g. `.pain-point-miner/runs/2026-08-08T19-12-00Z`).
 */
export function createSkillRunFolderPath(
  options: CreateSkillRunFolderPathOptions = {},
): string {
  const root = options.runsRoot ?? DEFAULT_SKILL_RUNS_ROOT;
  const now = options.now ?? new Date();
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  return `${root.replace(/\/$/, "")}/${stamp}`;
}

export type AssembleRunReportInput = {
  handoff: SkillMiningHandoff;
  analysisOutcomes: readonly AnalysisOutcome[];
  /** Run folder identity shown in the report (usually the runDir path). */
  runId: string;
  /**
   * Override degradation notes. When omitted, uses `handoff.sourceDegradationNotes`.
   */
  sourceDegradationNotes?: readonly string[];
};

/**
 * Report Agent seam: partition Analysis outcomes and format the Run Report
 * skeleton (ADR-0015). Does not re-judge Hollow vs Brief or invent Evidence —
 * quotes come only from handoff gated-cluster Evidence matching Brief links.
 */
export function assembleRunReport(input: AssembleRunReportInput): string {
  const { briefs, hollowRejections } = partitionAnalysisOutcomes(
    input.analysisOutcomes,
  );
  const evidence = evidenceFromHandoff(input.handoff);
  const notes =
    input.sourceDegradationNotes ?? input.handoff.sourceDegradationNotes;

  return formatRunReport({
    briefs,
    hollowRejections,
    meta: {
      runId: input.runId,
      intent: input.handoff.intent,
      saturationStopped: input.handoff.saturationStopped,
      ...(notes.length > 0 ? { sourceDegradationNotes: notes } : {}),
    },
    evidence,
  });
}

export type WriteSkillRunFolderInput = {
  runDir: string;
  handoff: SkillMiningHandoff;
  analysisOutcomes: readonly AnalysisOutcome[];
  sourceDegradationNotes?: readonly string[];
};

export type WriteSkillRunFolderResult = {
  handoffPath: string;
  reportPath: string;
  reportMarkdown: string;
};

/**
 * Write Skill handoff + Run Report under a time-based run folder.
 * Artifacts: `handoff.json`, `report.md` (via `assembleRunReport` / formatter).
 */
export async function writeSkillRunFolder(
  input: WriteSkillRunFolderInput,
): Promise<WriteSkillRunFolderResult> {
  await mkdir(input.runDir, { recursive: true });

  const handoffPath = join(input.runDir, "handoff.json");
  const reportPath = join(input.runDir, "report.md");
  const reportMarkdown = assembleRunReport({
    handoff: input.handoff,
    analysisOutcomes: input.analysisOutcomes,
    runId: input.runDir,
    ...(input.sourceDegradationNotes !== undefined
      ? { sourceDegradationNotes: input.sourceDegradationNotes }
      : {}),
  });

  await writeFile(
    handoffPath,
    `${JSON.stringify(input.handoff, null, 2)}\n`,
    "utf8",
  );
  await writeFile(reportPath, reportMarkdown, "utf8");

  return { handoffPath, reportPath, reportMarkdown };
}

function evidenceFromHandoff(
  handoff: SkillMiningHandoff,
): EvidenceRef[] {
  const items: EvidenceRef[] = [];
  for (const cluster of handoff.gatedClusters) {
    for (const item of cluster.evidence) {
      items.push(item);
    }
  }
  return items;
}
