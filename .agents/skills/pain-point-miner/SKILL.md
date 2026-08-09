---
name: pain-point-miner
description: >
  Mine real Pain Points via the Script (live), then run Analysis Pass one
  Candidate Cluster at a time in Cursor agents, and assemble a Run Report.
  Use when the Builder wants evidence-grounded Pain Points / Briefs from
  public Signal Sources, or asks to run Pain Point Miner / mine demand
  signals without inventing crawl targets in chat.
---

# Pain Point Miner

v1 is **Script + Skill** (ADR-0009). The Script owns crawl → Follow-on → Store Second Pass → cluster → Count Gate / Saturation Stop. This Skill **interviews Intent**, runs the Script **live**, fans out Analysis Pass **one gated Candidate Cluster at a time** in Cursor agents (ADR-0011 / ADR-0013), then hands outcomes to a **Report Agent** for the **Run Report** (ADR-0015).

Vocabulary: root [`CONTEXT.md`](../../../CONTEXT.md). Decisions: [`docs/adr/0009`](../../../docs/adr/0009-script-under-skill.md), [`docs/adr/0011`](../../../docs/adr/0011-per-cluster-analysis-pass.md), [`docs/adr/0012`](../../../docs/adr/0012-free-local-embeddings-in-snapshot.md), [`docs/adr/0013`](../../../docs/adr/0013-analysis-pass-agent-only.md), [`docs/adr/0014`](../../../docs/adr/0014-live-mining-for-real-usage.md), [`docs/adr/0015`](../../../docs/adr/0015-run-report-via-report-agent.md), [`docs/adr/0016`](../../../docs/adr/0016-reddit-via-archive-not-live.md).

## Hard rules

1. **Real usage = live mining** (ADR-0014). Fixtures are for tests/CI only — never offer fixture crawl as the Builder’s product path.
2. **Call the Script** for mining. Do not re-implement crawl, Follow-on, clustering, or gates in chat. Do not switch to Skill-only crawl to “fix” Reddit access — Reddit cold-start/Follow-on is **Reddit (via archive)** inside the Script (ADR-0016).
3. **Per-cluster Analysis Pass only**, in **Cursor agents** (ADR-0013) — not a product LLM HTTP adapter. Each subagent receives **one** gated Candidate Cluster’s Evidence plus Intent / Brief fields for that cluster.
4. **Never** paste the full scrape corpus, all Candidate Clusters, or the entire `evidence[]` array into a single Analysis Pass prompt.
5. **Embeddings are free/local** (ADR-0012) — do not require a paid embedding API for the product path. Prefer models baked into the Cloud environment snapshot.
6. **Deliver a Run Report** (polished Markdown in a time-based run folder via `formatRunReport` / `writeSkillRunFolder`), not a raw `RunArtifact` dump as the Builder-facing output (ADR-0015).

## Process

### 0. Interview Intent (optional answers)

Before mining, grill the Builder on **functional Intent** only — explain each field; they may skip any or all (empty Intent → defaults):

| Field | Role |
| --- | --- |
| Theme | Broad steer (e.g. “AI automation”) |
| product shape | Preference note for Analysis / Run Report |
| constraints | Preference note |
| hard nos | Preference note |
| success definition | Preference note |

Do **not** interrogate Count Gate / Saturation Stop / Competition Filter / CLI plumbing unless the Builder volunteers overrides. Filled Intent must not whitelist or invent crawl targets (ADR-0004).

Create a time-based run folder for this run with `prepareSkillRunFolder()` (creates `.pain-point-miner/runs/<timestamp>/` on disk) and keep handoff + Run Report under it.

### 1. Mine via Script (live)

From the repo root. Prefer the **Skill handoff** so chat never loads the full scrape `evidence[]`:

```bash
npm install
# Real usage: live Entry Catalog (+ Follow-on/Store). Embeddings must be free/local (ADR-0012).
# Omit token-gated deepenings (e.g. PRODUCT_HUNT_TOKEN) when unset — do not block the run.
# Handoff includes sourceDegradationNotes for the Run Report when deepenings
# skip or a mining-port Signal Source / Follow-on / Store Second Pass fails.
npm run cli -- --live --format json --handoff skill \
  --out .pain-point-miner/runs/<timestamp>/handoff.json \
  [--theme "..."] [--product-shape "..."] [--constraints "..."] \
  [--hard-nos "..."] [--success-definition "..."]
```

Wire Intent flags the Builder actually answered. Handoff carries `intent`, `gatedClusters`, `saturationStopped`, and `sourceDegradationNotes` (`toSkillMiningHandoff` merges `RunArtifact` runtime notes with `liveSourceDegradationNotes` token-gated skips).

**Priority for live sources:** token-free paths first (Reddit (via archive) per ADR-0016, HN, store review HTTP). Skip or degrade token-gated Follow-on (e.g. Product Hunt) when credentials are absent; port-level runtime failures also note without blocking — both land on the handoff for the Run Report. When Reddit archive access degrades, `sourceDegradationNotes` label the channel as **Reddit (via archive)**. Builder-facing Reddit Evidence links in the Run Report must include Archive Permalinks (canonical reddit.com URLs alone are not enough).

**Embeddings:** `--live` defaults to free/local `createLocalEmbeddings` (ADR-0012; model `Xenova/bge-small-en-v1.5`, cache `PPM_EMBEDDINGS_CACHE_DIR` / `.pain-point-miner/models`). Do **not** treat `OPENAI_API_KEY` / paid embedding APIs as the product requirement. Prefer snapshot-baked weights via `npm run bake:local-embeddings` (Cloud `.cursor/environment.json` install; ticket #37). OpenAI-compatible is experimental only (`PPM_EMBEDDINGS_BACKEND=openai-compatible`).

**Done when:** a Skill handoff exists with `gatedClusters` (Count Gate survivors). Ungated clusters never enter Analysis Pass.

### 2. Fan out Analysis Pass (one Cursor subagent per cluster)

For every entry in `gatedClusters`, start a **separate** Cursor subagent (parallel OK):

- **Input:** that cluster only (`cluster.id`, `cluster.evidence`, `cluster.signalMix`, `cluster.evidenceCount`) plus optional Intent. Reddit Evidence may carry both canonical `url` and `archivePermalink`.
- **Judgment:** Hollow → reject with reason; else emit a Pain Point **Brief**.
- **Brief fields:** Pain Point summary, Evidence links (`evidenceLinks`), Target Market, Competitive Landscape, status-quo spend signals, Delivery Cost, difficulty S/M/L, Signal Mix, competition density annotation.
- **Reddit `evidenceLinks`:** when cluster Evidence has an **Archive Permalink**, include it in Brief `evidenceLinks` (canonical Reddit URL may also appear). Emit links already present on the cluster — do not invent URLs.
- **Return** the structured outcome to the parent / Report Agent — do not write the final Run Report inside each analysis subagent.

See [ANALYSIS.md](ANALYSIS.md) for the per-cluster checklist.

**Done when:** every gated cluster has exactly one outcome (`hollow` | `brief`), and no analysis step saw sibling clusters or the full `evidence` scrape.

### 3. Report Agent → Run Report

A **Report Agent** (or equivalent Skill step) integrates all Analysis outcomes:

1. Collect structured outcomes (`hollow` | `brief`) from every analysis subagent — do **not** re-judge Hollow vs Brief or invent Evidence.
2. Write the run folder with the library seam (starts from the formatter — do not improvise report structure):

```ts
import {
  writeSkillRunFolder,
  type AnalysisOutcome,
  type SkillMiningHandoff,
} from "pain-point-miner";
// or relative: src/packages/pain-point-miner/index.ts

await writeSkillRunFolder({
  runDir: ".pain-point-miner/runs/<timestamp>",
  handoff, // loaded SkillMiningHandoff (includes sourceDegradationNotes)
  analysisOutcomes, // AnalysisOutcome[] from step 2
});
// → handoff.json + report.md under runDir
```

   Equivalent pure step without I/O: `assembleRunReport({ handoff, analysisOutcomes, runId })` → Markdown (uses `formatRunReport`).
3. Chat: short pointer to the Run Report path (`report.md`) + brief highlights — not a raw JSON dump.

**Done when:** the Builder can open the Run Report and act on Briefs without reading a full-corpus dump.

## Smoke path (fixtures + tests only)

```bash
npm test -- src/packages/pain-point-miner/tests/skill-product-path.test.ts
npm test -- src/packages/pain-point-miner/tests/skill-orchestrator.test.ts
```

Fixtures and test-double `AnalysisPass` ports are for CI/offline tests (ADR-0014 / ADR-0013). They are not the Cloud Agent product path. `createLlmAnalysisPass` is experimental only — not the product Analysis surface.
