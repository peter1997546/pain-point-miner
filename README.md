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

`PainPointMiner.run(input?) → RunArtifact` is the single public product seam. Signal Source, embedding, Follow-on Fetch, Store Second Pass, and Analysis Pass adapters are injectable behind that seam (fixtures / test doubles for tests; live network / LLM adapters come later).

Pipeline inside `run`: Entry Catalog Signal Sources → Follow-on Fetch (Demand Signal pages before alternative/review) → Store Second Pass (reviews only for apps mentioned in forum Evidence) → Candidate Clusters / Count Gate / Saturation Stop → **per-cluster** Analysis Pass (Hollow vs Brief + Signal Mix) → optional Competition Filter view. Deepened Evidence feeds the same clustering and gates.

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

```bash
npm install
npm run cli -- --format markdown
npm run cli -- --format json --out artifact.json
```

## Checks

```bash
npm run check   # typecheck + tests
npm test
npm run typecheck
```
