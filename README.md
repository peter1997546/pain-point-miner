# Pain Point Miner

Helps an indie Builder discover real Pain Points by mining public signals. v1 is a **Script + Skill** hybrid. See [`CONTEXT.md`](./CONTEXT.md) for vocabulary and [`docs/adr/`](./docs/adr/) for decisions.

## Product seam

```ts
import {
  createPainPointMiner,
  createFixtureSignalSources,
} from "pain-point-miner";

const miner = createPainPointMiner({
  signalSources: createFixtureSignalSources(),
});

// Empty Intent is valid — documented default is `{}`.
const artifact = await miner.run({});
```

`PainPointMiner.run(input?) → RunArtifact` is the single public product seam. Signal Source adapters are injectable behind that seam (fixtures for tests / local inspection; live network adapters come later).

### Defaults

| Input | Default |
| --- | --- |
| `run()` / `run({})` / omitted `intent` | Empty Intent `{}` |
| Script CLI Signal Sources | Built-in fixtures (no live network) |
| Script CLI `--format` | `markdown` |

`RunArtifact` exposes quotable, linkable Evidence references. The raw scrape corpus is not part of the public contract.

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
