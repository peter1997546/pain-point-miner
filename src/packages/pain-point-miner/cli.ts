#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  createDefaultFixtureFollowOnFetcher,
  createDefaultFixtureStoreReviewSource,
  createFixtureEmbeddings,
  createFixtureSignalSources,
  createLiveDiscoveryMiner,
  createPainPointMiner,
  formatRunArtifact,
  toSkillMiningHandoff,
  type AnalysisPass,
  type ArtifactFormat,
  type Embeddings,
  type FollowOnFetcher,
  type Intent,
  type LiveDiscoveryMinerDeps,
  type LiveEmbeddingsBackend,
  type RunInput,
  type SignalSource,
  type StoreReviewSource,
} from "./index.js";

export type CliIo = {
  signalSources?: readonly SignalSource[];
  embeddings?: Embeddings;
  followOnFetcher?: FollowOnFetcher;
  storeReviewSource?: StoreReviewSource;
  /**
   * Optional Analysis Pass for fixture / injectable runs.
   * Lets Competition Filter and Intent→Analysis wiring be exercised offline.
   */
  analysisPass?: AnalysisPass;
  /** Env for `--live` (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Overrides for the `--live` composition (injectable doubles / recordings). */
  liveDiscovery?: LiveDiscoveryMinerDeps;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
};

type ParsedCli = {
  format: ArtifactFormat;
  outPath: string | undefined;
  skillHandoff: boolean;
  live: boolean;
  runInput: RunInput;
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

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseFiniteNumber(flag: string, value: string | undefined): number {
  const raw = requireValue(flag, value);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} requires a finite number`);
  }
  return parsed;
}

/** Count Gate / Saturation Stop K — glossary defaults are positive integers. */
function parsePositiveNumber(flag: string, value: string | undefined): number {
  const parsed = parseFiniteNumber(flag, value);
  if (!(parsed > 0)) {
    throw new Error(`${flag} requires a number greater than 0`);
  }
  return parsed;
}

function parseArgs(argv: string[]): ParsedCli {
  let format: ArtifactFormat = "markdown";
  let outPath: string | undefined;
  let skillHandoff = false;
  let live = false;
  const intent: Intent = {};
  let countGateThreshold: number | undefined;
  let saturationStopK: number | undefined;
  let competitionFilterThreshold: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format") {
      format = parseFormat(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--out") {
      outPath = requireValue("--out", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--handoff") {
      const value = requireValue("--handoff", argv[i + 1]);
      if (value !== "skill") {
        throw new Error(`Unsupported --handoff: ${value} (use skill)`);
      }
      skillHandoff = true;
      i += 1;
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--theme") {
      intent.theme = requireValue("--theme", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--product-shape") {
      intent.productShape = requireValue("--product-shape", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--constraints") {
      intent.constraints = requireValue("--constraints", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--hard-nos") {
      intent.hardNos = requireValue("--hard-nos", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--success-definition") {
      intent.successDefinition = requireValue(
        "--success-definition",
        argv[i + 1],
      );
      i += 1;
      continue;
    }
    if (arg === "--count-gate-threshold") {
      countGateThreshold = parsePositiveNumber(
        "--count-gate-threshold",
        argv[i + 1],
      );
      i += 1;
      continue;
    }
    if (arg === "--saturation-stop-k") {
      saturationStopK = parsePositiveNumber("--saturation-stop-k", argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--competition-filter-threshold") {
      competitionFilterThreshold = parseFiniteNumber(
        "--competition-filter-threshold",
        argv[i + 1],
      );
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("HELP");
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const runInput: RunInput = {};
  if (Object.keys(intent).length > 0) {
    runInput.intent = intent;
  }
  if (countGateThreshold !== undefined) {
    runInput.countGateThreshold = countGateThreshold;
  }
  if (saturationStopK !== undefined) {
    runInput.saturationStopK = saturationStopK;
  }
  if (competitionFilterThreshold !== undefined) {
    runInput.competitionFilterThreshold = competitionFilterThreshold;
  }

  return { format, outPath, skillHandoff, live, runInput };
}

const HELP = `Usage: pain-point-miner [options]

Runs PainPointMiner.run with the same RunInput contract as the library and
emits a RunArtifact. Omitted Intent / threshold flags keep documented defaults
(empty Intent {}, Count Gate 5, Saturation Stop 20, no Competition Filter).

Default (no --live): fixture Signal Sources / Embeddings / Follow-on / Store
(no live network or embedding API) for CI and local inspection.

--live: Entry Catalog cold start + Follow-on Fetch / Store Second Pass + free/local
Embeddings (ADR-0012; no paid embedding API key). Optional experimental
OpenAI-compatible backend via PPM_EMBEDDINGS_BACKEND=openai-compatible and
OPENAI_API_KEY. Optional PRODUCT_HUNT_TOKEN for PH Follow-on. Does not use
hash-only fixture Embeddings.

Intent fields are preference notes only — they do not whitelist, drop, or
invent Signal Sources / crawl targets.

Options:
  --live                            Live discovery (Entry Catalog + Follow-on/Store + local Embeddings)
  --format                          Output format: json|markdown (default: markdown)
  --handoff                         skill — emit condensed gated clusters for Skill Analysis Pass
                                    (JSON only; omits full scrape evidence[])
  --out                             Write to a file instead of stdout
  --theme                           Intent Theme preference note
  --product-shape                   Intent product shape preference note
  --constraints                     Intent constraints preference note
  --hard-nos                        Intent hard nos preference note
  --success-definition              Intent success definition preference note
  --count-gate-threshold            Count Gate N (default: 5)
  --saturation-stop-k               Saturation Stop K (default: 20)
  --competition-filter-threshold    Competition Filter density cutoff (default: none)
  -h, --help                        Show this help
`;

function buildMiner(live: boolean, io: CliIo) {
  if (!live) {
    return createPainPointMiner({
      signalSources: io.signalSources ?? createFixtureSignalSources(),
      embeddings: io.embeddings ?? createFixtureEmbeddings(),
      followOnFetcher:
        io.followOnFetcher ?? createDefaultFixtureFollowOnFetcher(),
      storeReviewSource:
        io.storeReviewSource ?? createDefaultFixtureStoreReviewSource(),
      ...(io.analysisPass !== undefined
        ? { analysisPass: io.analysisPass }
        : {}),
    });
  }

  const env = io.env ?? process.env;
  const fromLive = io.liveDiscovery ?? {};
  const embeddingsBackend =
    fromLive.embeddingsBackend ??
    parseEmbeddingsBackend(env.PPM_EMBEDDINGS_BACKEND);
  const apiKey = fromLive.apiKey ?? env.OPENAI_API_KEY;
  const embeddingModel = fromLive.embeddingModel ?? env.OPENAI_EMBEDDING_MODEL;
  const productHuntAccessToken =
    fromLive.productHuntAccessToken ?? env.PRODUCT_HUNT_TOKEN;
  const localCacheDir =
    fromLive.localEmbeddings?.cacheDir ?? env.PPM_EMBEDDINGS_CACHE_DIR;

  // Top-level CliIo ports override liveDiscovery bag (tests inject either).
  const liveDeps: LiveDiscoveryMinerDeps = {
    ...fromLive,
    ...(embeddingsBackend !== undefined ? { embeddingsBackend } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(embeddingModel !== undefined ? { embeddingModel } : {}),
    ...(productHuntAccessToken !== undefined
      ? { productHuntAccessToken }
      : {}),
    localEmbeddings: {
      ...(fromLive.localEmbeddings ?? {}),
      ...(localCacheDir !== undefined ? { cacheDir: localCacheDir } : {}),
      env,
    },
    ...(io.signalSources !== undefined
      ? { signalSources: io.signalSources }
      : {}),
    ...(io.embeddings !== undefined ? { embeddings: io.embeddings } : {}),
    ...(io.followOnFetcher !== undefined
      ? { followOnFetcher: io.followOnFetcher }
      : {}),
    ...(io.storeReviewSource !== undefined
      ? { storeReviewSource: io.storeReviewSource }
      : {}),
  };

  return createLiveDiscoveryMiner(liveDeps);
}

function parseEmbeddingsBackend(
  value: string | undefined,
): LiveEmbeddingsBackend | undefined {
  if (value === undefined || value === "" || value === "local") {
    return value === "local" ? "local" : undefined;
  }
  if (value === "openai-compatible") {
    return "openai-compatible";
  }
  throw new Error(
    `Unsupported PPM_EMBEDDINGS_BACKEND: ${value} (use local|openai-compatible)`,
  );
}

export async function runCli(
  argv: string[],
  io: CliIo = {},
): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  try {
    const { format, outPath, skillHandoff, live, runInput } = parseArgs(argv);
    if (skillHandoff && format !== "json") {
      throw new Error("--handoff skill requires --format json");
    }

    const miner = buildMiner(live, io);
    const artifact = await miner.run(runInput);
    const rendered = skillHandoff
      ? `${JSON.stringify(toSkillMiningHandoff(artifact), null, 2)}\n`
      : formatRunArtifact(artifact, format);

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
    stderr.write(`${message}\n`);
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
