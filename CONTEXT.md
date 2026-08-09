# Pain Point Miner

Helps an indie builder discover real Pain Points by mining public signals and analyzing them — a Miner that *finds* unmet demand, not a form that *restricts* search, and not a competitor-complaint scraper whose job is only to improve on a named product. v1 is a **Script + Skill** hybrid: the Script holds crawl/cluster/count outside the model context; the Skill runs a **per-cluster** Analysis Pass (one Candidate Cluster / Pain Point at a time, optionally multi-agent) — never the full scrape dump.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The job of this tool: start from an Entry Catalog, crawl Signal Sources, Follow-on Fetch concrete demand-side pages, group Evidence into Candidate Clusters with meaning similarity, apply the Count Gate, Saturation Stop, then Analysis Pass → Pain Points and Briefs, assembled into a Run Report for the Builder.
_Avoid_: Verifier, restricted search form, brainstormer, competitor-complaint miner (as the primary job)

**Script**:
The out-of-band pipeline that crawls, Follow-on Fetches, clusters, and applies the Count Gate / Saturation Stop — so raw Evidence never has to be stuffed into an agent context window. Required in v1 because a pure Skill path would drown the agent in volume. When a Signal Source’s live edge is blocked, the Script switches access channel (e.g. Reddit (via archive)); it is not replaced by Skill-only crawl.
_Avoid_: Notebook one-off (unless it is the Script), skill-only crawl, “pure Skill” as the fix for source access

**Skill**:
Agent-facing orchestration: interview optional Intent, call the Script for **live** mining, fan out a **per-cluster** Analysis Pass — one Candidate Cluster at a time (multi-agent OK), each agent seeing only that cluster’s Evidence plus needed Brief fields — then hand outcomes to a Report Agent to assemble the Run Report. Never the entire crawl corpus in one prompt.
_Avoid_: Skill-only product, pasting full crawl into chat, single-shot “analyze everything” dump, fixture mining as a real-usage mode, Skill-side reimplementation of Entry Catalog crawl to bypass Script

**Intent**:
Optional free-text preference notes the Builder *may* fill: Theme, product shape, constraints, hard nos, and success definition. Empty Intent is valid. Filled fields inform the Analysis Pass and Run Report assembly only (e.g. shaping Delivery Cost commentary) — they do not whitelist, drop, or invent Signal Sources / crawl targets; deepening is via Follow-on Fetch of concrete pages already found.
_Avoid_: Intake form, requirements form, restriction sheet, treating Intent as crawl config

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
A concrete public artifact (post, review, thread) pulled from a Signal Source — quotable and linkable. Produced by crawling (code), not by model invention. Reddit-origin Evidence keeps a canonical Reddit URL and must also expose an Archive Permalink wherever the Builder is expected to open the link (Run Report / Brief).
_Avoid_: Anecdote (unsourced), “market insight” without a source, Report links that only point at live reddit.com when an Archive Permalink exists

**Archive Permalink**:
A Builder-openable archive deep link (or equivalent archive identity URL) for an Evidence item when the live Signal Source URL is not a reliable product-path open target. For Reddit (via archive), derived by converting the canonical Reddit URL / id — not by inventing a new artifact.
_Avoid_: Replacing Evidence with archive search snippets that have no stable id, treating Google/Bing result URLs as the Evidence link

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

**Signal Mix**:
Label on a Candidate Cluster / Brief: how much of its Evidence is Demand Signal vs Incumbent Friction. Both may count toward Evidence Count, but the mix must be visible so the Builder knows whether the cluster is “missing need” vs “named-product gripe.”
_Avoid_: Hiding alternative/review evidence inside an unlabeled Pain Point

**Pain Point**:
A Candidate Cluster that (1) passes the Count Gate and (2) survives the Analysis Pass judgment that it is not Hollow. Carries a Signal Mix label.
_Avoid_: Problem (as the formal name), idea, brainstorm topic

**Hollow**:
Analysis Pass judgment that complaints are not a real Pain Point: wish-only with no scene / workaround / observable failure, and/or interchangeable platitudes whose Evidence does not point at one concrete pain.
_Avoid_: Low quality (vague), spam (different problem)

**Analysis Pass**:
AI steps run **per Candidate Cluster** in the Cursor agent / Skill (one problem at a time; multi-agent allowed): Hollow vs real, Signal Mix, then Brief enrichment (Competitive Landscape, Delivery Cost, status-quo spend, difficulty, etc.). Does not invent Evidence and must not receive the full scrape as one blob. Not a product-required live LLM API.
_Avoid_: Brainstorm pass, ideation, “Software Fit” (retired), batch-dump analysis, treating a hosted LLM adapter as the product Analysis path

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
Reddit (via archive), Apple App Store reviews, Google Play reviews, Hacker News, Product Hunt, Indie Hackers.
_Avoid_: G2/Capterra (v1), GitHub issues (v1), Chrome Web Store (v1), live reddit.com as the product Reddit access path, “Google site:reddit.com” as a Reddit substitute

**Entry Catalog** (v1):
Cold-start before Follow-on Fetch:
- Reddit (via archive) boards (primary): `r/smallbusiness`, `r/freelance`, `r/sysadmin`, `r/webdev`, `r/sales`, `r/marketing`, `r/ecommerce`
- Reddit (via archive) query patterns (Demand-oriented): wish / tool for / why no / spreadsheet workaround / how do you handle
- HN: Ask HN–style frustration / wish searches
- Product Hunt & Indie Hackers: not primary cold-start; Follow-on when referenced
- Large founder boards (e.g. Entrepreneur): deprioritized in the first wave
_Avoid_: Hot-only firehose, competitor-subreddit sweep as the primary entry, PH/IH as main demand entry, treating live Reddit JSON/HTML as required for cold-start

**Signal Source**:
One channel from the Source Catalog mined for Evidence.
_Avoid_: Corpus, scrape target (implementation wording)

**Follow-on Fetch**:
When material points at a *specific* demand-relevant page or thread, or names a product/app worth a Store Second Pass, fetch it next. Prefer Demand Signal pages over generic “best alternative / review” pages when choosing what to deepen. Reddit URLs discovered in material are converted and deepened via Reddit (via archive), not re-fetched as live reddit.com.
_Avoid_: Intent-biased source picking, treating every “alternative to X” link as a Demand Signal, Follow-on that depends on opening live reddit.com in the product environment

**Store Second Pass**:
App Store / Play reviews for apps *mentioned* in forum-style Evidence — secondary, often Incumbent Friction, used to enrich not to define demand.
_Avoid_: Seed app list as the primary store strategy

**Brief**:
Enriched Analysis Pass output: Pain Point + Evidence, inferred Target Market, Competitive Landscape, status-quo spend signals, Delivery Cost, difficulty S/M/L. MVP sketch optional in v1.
_Avoid_: Opportunity report, idea list, ChatGPT-style market blurb

**Run Report**:
The Builder-facing polished Markdown artifact assembled after per-cluster Analysis Pass outcomes return — Briefs plus Hollow rejections, readable rather than a raw `RunArtifact` dump. Written under a time-based run folder. Produced by a Report Agent (or equivalent Skill step) that integrates sub-agent results; it does not re-judge Hollow vs Brief and does not invent Evidence.
_Avoid_: Opportunity report, raw RunArtifact dump as the Builder deliverable, ChatGPT-style market blurb
