# Pain Point Miner

Helps an indie Builder discover real Pain Points by mining public signals. v1 is a **Script + Skill** hybrid. See [`CONTEXT.md`](./CONTEXT.md) for vocabulary and [`docs/adr/`](./docs/adr/) for decisions.

## Product seam

```ts
import {
  createPainPointMiner,
  createFixtureEmbeddings,
  createFixtureSignalSources,
} from "pain-point-miner";

const miner = createPainPointMiner({
  signalSources: createFixtureSignalSources(),
  embeddings: createFixtureEmbeddings(),
});

// Empty Intent is valid — documented default is `{}`.
const artifact = await miner.run({});
```

`PainPointMiner.run(input?) → RunArtifact` is the single public product seam. Script CLI and Skill are adapters over it. Signal Source, embedding, Follow-on Fetch, Store Second Pass, and Analysis Pass adapters are injectable behind that seam (fixtures / test doubles / scripted local Embeddings for tests; live network + free/local Embeddings for real usage; optional experimental OpenAI-compatible adapters).

Pipeline inside `run`: Entry Catalog Signal Sources → Follow-on Fetch (Demand Signal pages before alternative/review) → Store Second Pass (reviews only for apps mentioned in forum Evidence) → Candidate Clusters / Count Gate / Saturation Stop → optional **per-cluster** Analysis Pass (Hollow vs Brief + Signal Mix) → optional Competition Filter view. Deepened Evidence feeds the same clustering and gates.

### Entry Catalog adapters (Reddit + HN)

Live cold-start adapters implement the same `SignalSource` port used by `run` (ADR-0010). They cover primary Reddit boards × demand query patterns and Ask HN–style HN searches. Product Hunt, Indie Hackers, and large founder boards (e.g. `r/Entrepreneur`) are **not** part of this wave.

### Store Second Pass + Follow-on adapters

App Store / Play implement `StoreReviewSource` (reviews only for apps mentioned in forum Evidence). Product Hunt / Indie Hackers implement `FollowOnFetcher` for referenced URLs — not cold-start firehoses (ADR-0007 / ADR-0010).

### Live discovery path (Entry Catalog + Follow-on / Store + Embeddings)

`createLiveDiscoveryMiner` is the first-class composition: Entry Catalog cold start, Follow-on / Store Second Pass, and **free/local Embeddings** (`createLocalEmbeddings`, ADR-0012) behind `PainPointMiner.run`. It does **not** pair Entry Catalog Evidence with hash-only fixture Embeddings. OpenAI-compatible embeddings are optional/experimental only.

```ts
import { createLiveDiscoveryMiner } from "pain-point-miner";

// Product path — no paid embedding API key.
const miner = createLiveDiscoveryMiner({
  productHuntAccessToken: process.env.PRODUCT_HUNT_TOKEN,
  // Optional: localEmbeddings: { cacheDir: process.env.PPM_EMBEDDINGS_CACHE_DIR }
});

const artifact = await miner.run({});
```

One-command Script CLI (same composition):

```bash
npm run cli -- --live --format json --out artifact.json
# optional: PRODUCT_HUNT_TOKEN=... PPM_EMBEDDINGS_CACHE_DIR=.pain-point-miner/models
# experimental paid backend only: PPM_EMBEDDINGS_BACKEND=openai-compatible OPENAI_API_KEY=sk-...
```

Without `--live`, Script CLI keeps built-in fixtures (no live network / embedding API) for CI and local inspection. Product Hunt Follow-on needs a developer token for live GraphQL; omit the token to skip PH Follow-on. CI injects local Embeddings doubles / recordings into `createLiveDiscoveryMiner` — no Hub download or paid API in tests.

### Baking local Embeddings into the Cloud environment snapshot

Cloud Agent **environment install** downloads `Xenova/bge-small-en-v1.5` into the same cache `createLocalEmbeddings` reads (ADR-0012 / ticket #37), so subsequent runs do not re-download weights on the happy path.

```bash
# Idempotent — writes under .pain-point-miner/models (gitignored)
npm run bake:local-embeddings
# optional: PPM_EMBEDDINGS_CACHE_DIR=/path/to/models npm run bake:local-embeddings
```

Repo-managed Cloud install (`.cursor/environment.json`) runs `npm ci && npm run bake:local-embeddings`. Override the cache with `PPM_EMBEDDINGS_CACHE_DIR`. Do not vendor model weights into git; tests keep using injectable `embedBatch` / `populate` doubles.

### Defaults

| Input | Default |
| --- | --- |
| `run()` / `run({})` / omitted `intent` | Empty Intent `{}` (optional `theme`, `productShape`, `constraints`, `hardNos`, `successDefinition` are Analysis Pass preference notes only — not crawl filters) |
| Count Gate | Evidence Count ≥ **5** |
| Saturation Stop | Halt once **20** Count-Gated clusters exist |
| Follow-on / Store Second Pass / Analysis Pass | Skipped when those ports are omitted |
| Competition Filter threshold | Omitted — all annotated Briefs stay visible (no silent hard-kill) |
| Script CLI (default) Signal Sources / Embeddings / Follow-on / Store | Built-in fixtures (no live network / embedding API) |
| Script CLI `--live` | Entry Catalog + Follow-on / Store + free/local Embeddings (no paid API key; model cache via `PPM_EMBEDDINGS_CACHE_DIR`) |
| Script CLI `--format` | `markdown` |

`RunArtifact` exposes quotable Evidence references, Candidate Clusters (with Evidence Count + Signal Mix hints), gated clusters, Analysis outcomes (Hollow rejections + Pain Point Briefs), and a Competition Filter view (`visibleBriefs` / `hiddenByCompetitionFilter`) that never deletes the full annotated `briefs` set. The raw scrape corpus is not part of the public contract.

`applyCompetitionFilter(briefs, threshold?)` is also exported for post-hoc hide/show over an already-emitted Brief set.

## Script CLI

The Script mines and gates only (no Analysis Pass by default). It exposes the same `RunInput` contract as `PainPointMiner.run`: optional Intent preference notes and Count Gate / Saturation Stop / Competition Filter overrides. Omitted flags keep glossary defaults. Use it for condensed gated candidates the Skill will analyze:

```bash
npm install
# Offline fixtures (CI / local inspection)
npm run cli -- --format markdown
npm run cli -- --format json --out artifact.json
# Optional Intent + gate overrides (preference notes only — not crawl filters)
npm run cli -- --format json --out artifact.json \
  --theme "AI automation" \
  --product-shape "solo-dev SaaS" \
  --count-gate-threshold 5 \
  --saturation-stop-k 20
# Live discovery (Entry Catalog + Follow-on/Store + free/local Embeddings)
npm run cli -- --live --format json --out artifact.json
# Condensed Skill handoff (gatedClusters only — no full scrape evidence[])
# Real usage: always pair with --live (fixtures without --live are tests/CI only)
npm run cli -- --live --format json --handoff skill \
  --out .pain-point-miner/runs/<timestamp>/handoff.json \
  --theme "AI automation"
```

## Skill (Script + per-cluster fan-out + Run Report)

Agent Skill: [`.agents/skills/pain-point-miner/SKILL.md`](./.agents/skills/pain-point-miner/SKILL.md) (ADR-0009 / ADR-0011 / ADR-0013–0015).

**Product path (Cloud Agent):**

1. Interview optional Intent (Theme, product shape, constraints, hard nos, success definition) — skip-all → empty Intent.
2. Live-mine via Script (`npm run cli -- --live --format json --handoff skill --out …/handoff.json`). Fixtures are tests-only.
3. Fan out Analysis Pass **one gated Candidate Cluster at a time in Cursor sub-agents** (parallel OK); each step sees only that cluster’s Evidence — never the full scrape. Hosted LLM Analysis (`createLlmAnalysisPass`) is **not** the product surface (ADR-0013).
4. Report Agent integrates outcomes with `writeSkillRunFolder` / `assembleRunReport` (uses `formatRunReport`) into a time-based run folder: `handoff.json` + `report.md`. Does not re-judge Hollow vs Brief or invent Evidence.
5. Token-free live sources first; token-gated deepenings (e.g. Product Hunt) skip without blocking — `sourceDegradationNotes` on the handoff feed the Run Report.

```bash
# Product Skill handoff (live; free/local Embeddings; notes when PH token unset)
mkdir -p .pain-point-miner/runs/<timestamp>
npm run cli -- --live --format json --handoff skill \
  --out .pain-point-miner/runs/<timestamp>/handoff.json
# After Cursor per-cluster Analysis outcomes return:
# writeSkillRunFolder({ runDir, handoff, analysisOutcomes }) → report.md
```

Programmatic Report Agent seam (tests / scripts):

```ts
import {
  assembleRunReport,
  createSkillRunFolderPath,
  writeSkillRunFolder,
  type AnalysisOutcome,
  type SkillMiningHandoff,
} from "pain-point-miner";

const runDir = createSkillRunFolderPath();
const reportMarkdown = assembleRunReport({
  handoff, // SkillMiningHandoff from --handoff skill
  analysisOutcomes, // from Cursor Analysis sub-agents
  runId: runDir,
});
await writeSkillRunFolder({ runDir, handoff, analysisOutcomes });
```

For CI fan-out mechanics only, `createSkillOrchestrator` + an injectable `AnalysisPass` double remains valid. `createLlmAnalysisPass` / OpenAI-compatible LLM clients may exist for experiments — they are not the Builder-facing Analysis path.

## Checks

```bash
npm run check   # typecheck + tests
npm test
npm run typecheck
```
