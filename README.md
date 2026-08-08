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

`PainPointMiner.run(input?) → RunArtifact` is the single public product seam. Script CLI and Skill are adapters over it. Signal Source, embedding, Follow-on Fetch, Store Second Pass, and Analysis Pass adapters are injectable behind that seam (fixtures / test doubles for tests; live network / LLM adapters come later).

Pipeline inside `run`: Entry Catalog Signal Sources → Follow-on Fetch (Demand Signal pages before alternative/review) → Store Second Pass (reviews only for apps mentioned in forum Evidence) → Candidate Clusters / Count Gate / Saturation Stop → optional **per-cluster** Analysis Pass (Hollow vs Brief + Signal Mix) → optional Competition Filter view. Deepened Evidence feeds the same clustering and gates.

### Entry Catalog adapters (Reddit + HN)

Live cold-start adapters implement the same `SignalSource` port used by `run` (ADR-0010). They cover primary Reddit boards × demand query patterns and Ask HN–style HN searches. Product Hunt, Indie Hackers, and large founder boards (e.g. `r/Entrepreneur`) are **not** part of this wave.

CI uses injectable `JsonHttpClient` recordings — no live network required. For a manual live crawl:

```ts
import {
  createPainPointMiner,
  createFixtureEmbeddings,
  createEntryCatalogSignalSources,
  createFetchHttpClient,
} from "pain-point-miner";

const miner = createPainPointMiner({
  signalSources: createEntryCatalogSignalSources({
    http: createFetchHttpClient(),
  }),
  embeddings: createFixtureEmbeddings(),
});

const artifact = await miner.run({});
```

Script CLI still defaults to built-in fixtures so local/CI inspection stays offline.

### Defaults

| Input | Default |
| --- | --- |
| `run()` / `run({})` / omitted `intent` | Empty Intent `{}` |
| Count Gate | Evidence Count ≥ **5** |
| Saturation Stop | Halt once **20** Count-Gated clusters exist |
| Follow-on / Store Second Pass / Analysis Pass | Skipped when those ports are omitted |
| Competition Filter threshold | Omitted — all annotated Briefs stay visible (no silent hard-kill) |
| Script CLI Signal Sources / Embeddings / Follow-on / Store | Built-in fixtures (no live network / LLM) |
| Script CLI `--format` | `markdown` |

`RunArtifact` exposes quotable Evidence references, Candidate Clusters (with Evidence Count + Signal Mix hints), gated clusters, Analysis outcomes (Hollow rejections + Pain Point Briefs), and a Competition Filter view (`visibleBriefs` / `hiddenByCompetitionFilter`) that never deletes the full annotated `briefs` set. The raw scrape corpus is not part of the public contract.

`applyCompetitionFilter(briefs, threshold?)` is also exported for post-hoc hide/show over an already-emitted Brief set.

## Script CLI

The Script mines and gates only (no Analysis Pass). Use it for condensed gated candidates the Skill will analyze:

```bash
npm install
npm run cli -- --format markdown
npm run cli -- --format json --out artifact.json
# Condensed Skill handoff (gatedClusters only — no full scrape evidence[])
npm run cli -- --format json --handoff skill --out .pain-point-miner/handoff.json
```

## Skill (Script + per-cluster fan-out)

Agent Skill: [`.agents/skills/pain-point-miner/SKILL.md`](./.agents/skills/pain-point-miner/SKILL.md) (ADR-0009 / ADR-0011).

1. Call the Script / `run` mining path (never crawl-in-chat).
2. Fan out Analysis Pass **one gated Candidate Cluster at a time** (parallel agents OK); each step sees only that cluster’s Evidence plus Brief context — never the full scrape.
3. Assemble Briefs / Hollow rejections; optional Competition Filter after emission.

Programmatic adapter:

```ts
import {
  createPainPointMiner,
  createSkillOrchestrator,
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
  analysisPass, // test double or live LLM
});

const artifact = await skill.run({});
```

## Checks

```bash
npm run check   # typecheck + tests
npm test
npm run typecheck
```
