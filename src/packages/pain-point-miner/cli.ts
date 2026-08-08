#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  createFixtureEmbeddings,
  createFixtureSignalSources,
  createPainPointMiner,
  formatRunArtifact,
  type ArtifactFormat,
  type Embeddings,
  type SignalSource,
} from "./index.js";

export type CliIo = {
  signalSources?: readonly SignalSource[];
  embeddings?: Embeddings;
  stdout?: { write(chunk: string): unknown };
};

function parseFormat(value: string | undefined): ArtifactFormat {
  if (value === undefined || value === "markdown") {
    return "markdown";
  }
  if (value === "json") {
    return "json";
  }
  throw new Error(`Unsupported --format: ${value} (use json|markdown)`);
}

function parseArgs(argv: string[]): {
  format: ArtifactFormat;
  outPath: string | undefined;
} {
  let format: ArtifactFormat = "markdown";
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format") {
      format = parseFormat(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--out") {
      outPath = argv[i + 1];
      if (!outPath) {
        throw new Error("--out requires a path");
      }
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("HELP");
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { format, outPath };
}

const HELP = `Usage: pain-point-miner [--format json|markdown] [--out path]

Runs PainPointMiner.run with empty Intent defaults against injectable
fixture Signal Sources (no live network) and emits a RunArtifact.

Options:
  --format   Output format (default: markdown)
  --out      Write to a file instead of stdout
  -h, --help Show this help
`;

export async function runCli(
  argv: string[],
  io: CliIo = {},
): Promise<number> {
  const stdout = io.stdout ?? process.stdout;

  try {
    const { format, outPath } = parseArgs(argv);
    const miner = createPainPointMiner({
      signalSources: io.signalSources ?? createFixtureSignalSources(),
      embeddings: io.embeddings ?? createFixtureEmbeddings(),
    });
    const artifact = await miner.run({});
    const rendered = formatRunArtifact(artifact, format);

    if (outPath) {
      await writeFile(outPath, rendered, "utf8");
    } else {
      stdout.write(rendered);
    }
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message === "HELP") {
      stdout.write(HELP);
      return 0;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/cli.ts") ||
    process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("pain-point-miner"));

if (isMain) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
