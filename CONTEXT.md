# Pain Point Miner

Helps an indie builder discover real Pain Points by mining public signals and analyzing them — a Miner that *finds*, not a form that *restricts* the Builder into a tiny preset search. Not a Verifier of a pre-held use case, and not an LLM brainstorm that invents generic directions. v1 is a personal script or skill with a fixed developer-oriented Source Catalog.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The job of this tool: crawl Signal Sources, group Evidence into Candidate Clusters with code-side similarity, apply the Count Gate, stop when the run is saturated, then run an Analysis Pass to keep real Pain Points and enrich Briefs. Success is finding truth in the wild — not asking the Builder for enough restrictions that only a handful of results can appear.
_Avoid_: Verifier, restricted search form, brainstormer

**Intent**:
Optional free-text fields the Builder *may* fill (Theme, product shape, constraints, hard nos, success definition). Empty Intent is valid. Filled fields are steers; they must not become a restriction sheet whose purpose is to pre-shrink the result set.
_Avoid_: Intake form, requirements form, restriction sheet

**Theme**:
An optional broad directional preference (e.g. “AI automation”, “提升效率”). Not a use case, workflow, or Target Market.
_Avoid_: Use case, scenario, problem statement

**Target Market**:
The people a Pain Point / Brief is about — including geography / locale when it matters. Discovered or refined from Evidence during a run.
_Avoid_: Niche (unless used informally), segment sheet

**Evidence**:
A concrete public artifact (post, review, thread, issue) pulled from a Signal Source — quotable and linkable. Produced by crawling (code), not by model invention.
_Avoid_: Anecdote (unsourced), “market insight” without a source

**Candidate Cluster**:
A code-grouped set of Evidence items treated as the same underlying complaint for counting. Grouping uses structural keys plus *meaning* similarity (e.g. embeddings / cosine) — not shared-word overlap as the main signal, and not an LLM “虛不虛” pass.
_Avoid_: Topic (too vague), bucket, keyword twin

**Evidence Count**:
The number N of distinct Evidence items in a Candidate Cluster. Computed by code.
_Avoid_: “Popularity score” (vague), engagement metrics as a substitute for complaint volume

**Count Gate**:
Deterministic rule: Evidence Count ≥ threshold (default 5) before a cluster is worth the Analysis Pass. Code can evaluate it; it does not judge hollow vs substantive.
_Avoid_: Quality filter, vibe check

**Saturation Stop**:
A run stops crawling when it already has at least **20** Candidate Clusters that passed the Count Gate. Stop is driven by *how much was found*, not by asking the Builder for more restrictions.
_Avoid_: User-imposed result cap, “Intent vagueness scales K” (rejected)

**Pain Point**:
A Candidate Cluster that (1) passes the Count Gate and (2) survives the Analysis Pass judgment that it is not Hollow. Volume alone is not enough.
_Avoid_: Problem (as the formal name), idea, brainstorm topic

**Hollow**:
Analysis Pass judgment that complaints are not a real Pain Point: wish-only statements with no scene / workaround / observable failure, and/or interchangeable platitudes (“要更有效率”, “要更好的 AI”) whose Evidence does not point at one concrete pain. Not decided by Evidence Count.
_Avoid_: Low quality (vague), spam (different problem)

**Analysis Pass**:
AI steps coding should not pretend to own: Hollow vs real, then Brief enrichment (Competitive Landscape, Delivery Cost, status-quo spend, rough next-build shape, etc.). Does not invent Evidence.
_Avoid_: Brainstorm pass, ideation, “Software Fit” (retired)

**Competitive Landscape**:
Annotation from the Analysis Pass about existing offerings and how strongly they already serve the relevant Target Market (quality, adoption, local penetration — not merely country of origin).
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
Judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
Builder’s post-hoc cutoff for competition density after the full annotated set is emitted.
_Avoid_: Auto-exclude, kill list, Intent-time hard kill

**Delivery Cost**:
Rough read from the Analysis Pass of build/run cost drivers for a plausible solution. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection, “LLM cost” (too narrow as the name)

**Source Catalog** (v1):
Reddit, Apple App Store reviews, Google Play reviews, Hacker News, Product Hunt, Indie Hackers. Other sources are out of v1 (placeholders only).
_Avoid_: G2/Capterra (v1), GitHub issues (v1), Chrome Web Store (v1), universal industry coverage

**Signal Source**:
One channel from the Source Catalog mined for Evidence.
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
Enriched output of the Analysis Pass on a Pain Point: inferred Target Market, Competitive Landscape, demand / status-quo spend signals, Delivery Cost, and a rough difficulty band (S/M/L) — still grounded in Evidence. A sketched MVP / next-build shape is optional, not required in v1.
_Avoid_: Opportunity report, idea list, feature request, ChatGPT-style market blurb
