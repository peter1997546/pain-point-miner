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
npm run cli -- --format json --handoff skill --out .pain-point-miner/handoff.json \
  --theme "AI automation"
```

## Skill (Script + per-cluster fan-out)

Agent Skill: [`.agents/skills/pain-point-miner/SKILL.md`](./.agents/skills/pain-point-miner/SKILL.md) (ADR-0009 / ADR-0011).

1. Call the Script / `run` mining path (never crawl-in-chat).
2. Fan out Analysis Pass **one gated Candidate Cluster at a time** (parallel agents OK); each step sees only that cluster’s Evidence plus Brief context — never the full scrape.
3. Assemble Briefs / Hollow rejections; optional Competition Filter after emission.

`createLlmAnalysisPass({ llm })` implements the Analysis Pass port: Hollow rejection (wish-only / platitude), Brief enrichment (Competitive Landscape with local penetration, status-quo spend, Delivery Cost as cost drivers, difficulty S/M/L, Signal Mix), and Evidence-link sanitization (never invents links). Inject a scripted `LlmClient` in tests, or `createOpenAiCompatibleLlmClient` for live runs.

Programmatic adapter:

```ts
import {
  createPainPointMiner,
  createSkillOrchestrator,
  createLlmAnalysisPass,
  createOpenAiCompatibleLlmClient,
  createFixtureEmbeddings,
  createFixtureSignalSources,
} from "pain-point-miner";

const scriptMiner = createPainPointMiner({
  signalSources: createFixtureSignalSources(),
  embeddings: createFixtureEmbeddings(),
  // omit analysisPass — Skill owns fan-out
});

const skill = createSkillOrchestrator({
  runMining: (input) => scriptMiner.run(input),
  analysisPass: createLlmAnalysisPass({
    llm: createOpenAiCompatibleLlmClient({
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    }),
  }),
});

const artifact = await skill.run({});
```

## Checks

```bash
npm run check   # typecheck + tests
npm test
npm run typecheck
```
