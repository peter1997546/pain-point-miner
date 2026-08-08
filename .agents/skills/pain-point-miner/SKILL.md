---
name: pain-point-miner
description: >
  Mine real Pain Points via the Script, then run Analysis Pass one Candidate
  Cluster at a time. Use when the Builder wants evidence-grounded Pain Points /
  Briefs from public Signal Sources, or asks to run Pain Point Miner / mine
  demand signals without inventing crawl targets in chat.
---

# Pain Point Miner

v1 is **Script + Skill** (ADR-0009). The Script owns crawl → Follow-on → Store Second Pass → cluster → Count Gate / Saturation Stop. This Skill **orchestrates the Script**, then fans out Analysis Pass **one gated Candidate Cluster at a time** (ADR-0011). Multi-agent fan-out across clusters is encouraged.

Vocabulary: root [`CONTEXT.md`](../../../CONTEXT.md). Decisions: [`docs/adr/0009`](../../../docs/adr/0009-script-under-skill.md), [`docs/adr/0011`](../../../docs/adr/0011-per-cluster-analysis-pass.md).

## Hard rules

1. **Call the Script** for mining — `npm run cli` or `PainPointMiner.run` / `createSkillOrchestrator({ runMining })`. Do not re-implement crawl, Follow-on, clustering, or gates in chat.
2. **Per-cluster Analysis Pass only.** Each analysis step (or subagent) receives **one** gated Candidate Cluster’s Evidence plus Intent / Brief fields needed for that cluster.
3. **Never** paste the full scrape corpus, all Candidate Clusters, or the entire `evidence[]` array into a single Analysis Pass prompt.

## Process

### 1. Mine via Script

From the repo root (fixtures; no live network in v1 Script defaults):

```bash
npm install
npm run cli -- --format json --out .pain-point-miner/mining.json
```

Or programmatically — Script mining **without** an `analysisPass` port, then Skill fan-out:

```ts
import {
  createPainPointMiner,
  createFixtureEmbeddings,
  createFixtureSignalSources,
  createDefaultFixtureFollowOnFetcher,
  createDefaultFixtureStoreReviewSource,
  createSkillOrchestrator,
} from "pain-point-miner";

const scriptMiner = createPainPointMiner({
  signalSources: createFixtureSignalSources(),
  embeddings: createFixtureEmbeddings(),
  followOnFetcher: createDefaultFixtureFollowOnFetcher(),
  storeReviewSource: createDefaultFixtureStoreReviewSource(),
  // no analysisPass — Skill owns fan-out
});

const skill = createSkillOrchestrator({
  runMining: (input) => scriptMiner.run(input),
  analysisPass, // test double or live LLM adapter
});

const artifact = await skill.run({});
```

**Done when:** a mining `RunArtifact` exists with `gatedClusters` (Count Gate survivors). Ungated clusters stay on `candidateClusters` only — they do not enter Analysis Pass.

### 2. Fan out Analysis Pass (one cluster each)

For every entry in `gatedClusters`, run Analysis Pass **separately** (parallel subagents OK):

- **Input:** that cluster only (`cluster.id`, `cluster.evidence`, `cluster.signalMix`, `cluster.evidenceCount`) plus optional Intent (`theme`, …).
- **Judgment:** Hollow → reject with reason; else emit a Pain Point **Brief**.
- **Brief fields:** Pain Point summary, Evidence links, Target Market, Competitive Landscape, status-quo spend signals, Delivery Cost, difficulty S/M/L, Signal Mix, competition density annotation.

See [ANALYSIS.md](ANALYSIS.md) for the per-cluster checklist.

**Done when:** every gated cluster has exactly one outcome (`hollow` | `brief`), and no analysis call saw sibling clusters or the full `evidence` scrape.

### 3. Assemble for the Builder

Merge outcomes into the shared `RunArtifact` shape (`briefs`, `hollowRejections`, `analysisOutcomes`). Apply optional Competition Filter (`competitionFilterThreshold` / `applyCompetitionFilter`) — annotate and hide/show; never silently delete high-competition Briefs (ADR-0001).

**Done when:** the Builder can inspect Briefs + Hollow rejections + filter visibility without a full-corpus dump in the chat transcript.

## Smoke path (fixtures + test double)

```bash
npm test -- src/packages/pain-point-miner/tests/skill-orchestrator.test.ts
```

That suite exercises Script mining → parallel per-cluster Analysis Pass with a test-double port (no live LLM). Live LLM Analysis Pass is a later ticket.
