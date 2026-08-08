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

`PainPointMiner.run(input?) → RunArtifact` is the single public product seam. Signal Source, embedding, Follow-on Fetch, and Store Second Pass adapters are injectable behind that seam (fixtures for tests / local inspection; live network adapters come later).

Pipeline inside `run`: Entry Catalog Signal Sources → Follow-on Fetch (Demand Signal pages before alternative/review) → Store Second Pass (reviews only for apps mentioned in forum Evidence) → Candidate Clusters / Count Gate / Saturation Stop. Deepened Evidence feeds the same clustering and gates.

### Defaults

| Input | Default |
| --- | --- |
| `run()` / `run({})` / omitted `intent` | Empty Intent `{}` |
| Count Gate | Evidence Count ≥ **5** |
| Saturation Stop | Halt once **20** Count-Gated clusters exist |
| Follow-on / Store Second Pass | Skipped when those ports are omitted |
| Script CLI Signal Sources / Embeddings | Built-in fixtures (no live network / LLM) |
| Script CLI `--format` | `markdown` |

`RunArtifact` exposes quotable Evidence references, Candidate Clusters (with Evidence Count), and which clusters passed the Count Gate. The raw scrape corpus is not part of the public contract.

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
