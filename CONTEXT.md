# Pain Point Miner

Helps an indie builder discover real Pain Points by mining public signals and analyzing them — a Miner that *finds* unmet demand, not a form that *restricts* search, and not a competitor-complaint scraper whose job is only to improve on a named product. v1 is a **script** at the core, with an optional **skill** wrapper that calls that script.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The job of this tool: start from an Entry Catalog, crawl Signal Sources, Follow-on Fetch concrete demand-side pages, group Evidence into Candidate Clusters with meaning similarity, apply the Count Gate, Saturation Stop, then Analysis Pass → Pain Points and Briefs.
_Avoid_: Verifier, restricted search form, brainstormer, competitor-complaint miner (as the primary job)

**Script**:
The runnable core that performs crawl → count → analysis. Required. There is no skill-only path without a Script underneath.
_Avoid_: Notebook one-off (unless it is the Script)

**Skill**:
An agent-facing wrapper that invokes the Script. Optional convenience; cannot replace the Script.
_Avoid_: Skill-only product

**Intent**:
Optional free-text fields the Builder *may* fill. Empty Intent is valid. Filled fields do not invent crawl targets; deepening is via Follow-on Fetch of concrete pages already found. May inform the Analysis Pass.
_Avoid_: Intake form, requirements form, restriction sheet

**Theme**:
An optional broad directional preference (e.g. “AI automation”, “提升效率”). Not a use case, workflow, or Target Market.
_Avoid_: Use case, scenario, problem statement

**Target Market**:
The people a Pain Point / Brief is about — including geography / locale when it matters. Discovered or refined from Evidence during a run.
_Avoid_: Niche (unless used informally), segment sheet

**Demand Signal**:
Evidence that someone needs something that is missing, manual, or unworkably painful — without the post being mainly “help me pick/replace product X.” Examples: “is there a tool for…”, “I wish there was…”, “why is there no…”, “I do this in a spreadsheet”, “how do you even handle…”. This is the primary dimension the Miner optimizes for.
_Avoid_: Alternative hunt (as the primary signal), review mining (as the primary signal)

**Incumbent Friction**:
Evidence mainly about problems with a *named existing product* (bugs, pricing, “alternative to X”, star reviews). Useful later for Competitive Landscape / Store Second Pass — a different dimension from Demand Signal. Not the cold-start definition of “finding a Pain Point.”
_Avoid_: Treating “alternative/review” threads as the same thing as demand discovery

**Evidence**:
A concrete public artifact (post, review, thread) pulled from a Signal Source — quotable and linkable. Produced by crawling (code), not by model invention.
_Avoid_: Anecdote (unsourced), “market insight” without a source

**Candidate Cluster**:
A code-grouped set of Evidence items treated as the same underlying complaint for counting. Grouping uses structural keys plus meaning similarity (embeddings / cosine), not shared-word overlap as the main signal.
_Avoid_: Topic (too vague), bucket, keyword twin

**Evidence Count**:
The number N of distinct Evidence items in a Candidate Cluster. Computed by code.
_Avoid_: “Popularity score” (vague)

**Count Gate**:
Deterministic rule: Evidence Count ≥ threshold (default 5) before a cluster is worth the Analysis Pass.
_Avoid_: Quality filter, vibe check

**Saturation Stop**:
Stop crawling when at least **20** Candidate Clusters have passed the Count Gate.
_Avoid_: User-imposed result cap

**Pain Point**:
A Candidate Cluster that (1) passes the Count Gate and (2) survives the Analysis Pass judgment that it is not Hollow — ideally rooted in Demand Signals, not only Incumbent Friction.
_Avoid_: Problem (as the formal name), idea, brainstorm topic

**Hollow**:
Analysis Pass judgment that complaints are not a real Pain Point: wish-only with no scene / workaround / observable failure, and/or interchangeable platitudes whose Evidence does not point at one concrete pain.
_Avoid_: Low quality (vague), spam (different problem)

**Analysis Pass**:
AI steps: Hollow vs real, then Brief enrichment (Competitive Landscape, Delivery Cost, status-quo spend, difficulty, etc.). Does not invent Evidence.
_Avoid_: Brainstorm pass, ideation, “Software Fit” (retired)

**Competitive Landscape**:
Annotation from the Analysis Pass about existing offerings and how strongly they already serve the relevant Target Market (including local penetration).
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
Judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
Builder’s post-hoc cutoff for competition density after the full annotated set is emitted.
_Avoid_: Auto-exclude, kill list

**Delivery Cost**:
Rough read of build/run cost drivers for a plausible solution. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection

**Source Catalog** (v1):
Reddit, Apple App Store reviews, Google Play reviews, Hacker News, Product Hunt, Indie Hackers.
_Avoid_: G2/Capterra (v1), GitHub issues (v1), Chrome Web Store (v1)

**Entry Catalog**:
The fixed cold-start list of places and query patterns used before any Follow-on Fetch — where Demand Signals commonly show up (customer/workflow communities and “missing tool / manual workaround” searches, not founder-meta echo chambers as the main diet). Maintained with the tool; the Builder is not asked to invent it each run.
_Avoid_: Hot-only firehose, competitor-subreddit sweep as the primary entry

**Signal Source**:
One channel from the Source Catalog mined for Evidence.
_Avoid_: Corpus, scrape target (implementation wording)

**Follow-on Fetch**:
When material points at a *specific* demand-relevant page or thread, or names a product/app worth a Store Second Pass, fetch it next. Prefer Demand Signal pages over generic “best alternative / review” pages when choosing what to deepen.
_Avoid_: Intent-biased source picking, treating every “alternative to X” link as a Demand Signal

**Store Second Pass**:
App Store / Play reviews for apps *mentioned* in forum-style Evidence — secondary, often Incumbent Friction, used to enrich not to define demand.
_Avoid_: Seed app list as the primary store strategy

**Brief**:
Enriched Analysis Pass output: Pain Point + Evidence, inferred Target Market, Competitive Landscape, status-quo spend signals, Delivery Cost, difficulty S/M/L. MVP sketch optional in v1.
_Avoid_: Opportunity report, idea list, ChatGPT-style market blurb
