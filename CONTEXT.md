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
The out-of-band pipeline that crawls, Follow-on Fetches, clusters, and applies the Count Gate / Saturation Stop — so raw Evidence never has to be stuffed into an agent context window. Required in v1 because a pure Skill path would drown the agent in volume.
_Avoid_: Notebook one-off (unless it is the Script), skill-only crawl

**Skill**:
Agent-facing orchestration: **interview Intent before mining** (offer every field; the Builder may leave any or all blank only after being asked), call the Script for **live** mining, fan out a **per-cluster** Analysis Pass — one Candidate Cluster at a time (multi-agent OK), each agent seeing only that cluster’s Evidence plus needed Brief fields — then hand outcomes to a Report Agent to assemble the Run Report. Never the entire crawl corpus in one prompt. The agent must not assume empty Intent unless the Builder explicitly opts out or says Intent is empty.
_Avoid_: Skill-only product, pasting full crawl into chat, single-shot “analyze everything” dump, fixture mining as a real-usage mode, skipping the Intent interview because empty Intent is a valid Script input

**Intent**:
Optional free-text preference notes the Builder *may* fill after the Skill interviews them: Theme, product shape, constraints, hard nos, and success definition. An empty Intent value is valid for the Script once the Builder has skipped or opted out — it is not permission for the agent to skip asking. Filled fields inform the Analysis Pass and Run Report assembly only (e.g. shaping Delivery Cost commentary) — they do not whitelist, drop, or invent Signal Sources / crawl targets; deepening is via Follow-on Fetch of concrete pages already found.
_Avoid_: Intake form, requirements form, restriction sheet, treating Intent as crawl config, equating “empty Intent is valid” with “do not interview”

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
Hacker News, Lobsters, Lemmy (lemmy.world), Dev.to, the verified Discourse host whitelist, and Apple App Store reviews (Store Second Pass). Default live path skips anything that needs a token or cannot be used normally on Cloud (e.g. Reddit public JSON, Product Hunt, fragile Play).
_Avoid_: Treating Reddit or Product Hunt as mandatory for real usage, G2/Capterra (v1), GitHub issues as Entry (v1), Chrome Web Store (v1), unpaid sources with unusably low rate limits as primary Entry

**Entry Catalog** (v1):
Cold-start before Follow-on Fetch — **free, no-token, Cloud-reachable** sources only:
- Hacker News: Ask HN–style frustration / wish searches (Algolia)
- Lobsters: demand-relevant listings (ask / rant / newest-style JSON)
- Lemmy: **lemmy.world** API search with Demand-oriented queries
- Dev.to: tag-based article listings (discuss / help)
- Discourse (finite verified hosts only): `meta.discourse.org`, `forum.cursor.com`, `forum.gitlab.com`, `community.openai.com`, `discuss.huggingface.co`
Channels that cannot be used normally without tokens or that fail on Cloud (e.g. Reddit public JSON, Product Hunt without token) are skipped for the default live path — not mandatory.
_Avoid_: Hot-only firehose, Reddit-as-mandatory primary, PH/IH as main demand entry, inventing crawl targets from Intent, unbounded “every Discourse on the internet”

**Signal Source**:
One channel from the Source Catalog mined for Evidence.
_Avoid_: Corpus, scrape target (implementation wording)

**Follow-on Fetch**:
When material points at a *specific* demand-relevant page or thread, or names a product/app worth a Store Second Pass, fetch it next. Prefer Demand Signal pages over generic “best alternative / review” pages when choosing what to deepen. Skip Follow-on targets that are not normally usable without tokens.
_Avoid_: Intent-biased source picking, treating every “alternative to X” link as a Demand Signal

**Store Second Pass**:
Apple App Store reviews for apps *mentioned* in forum-style Evidence — secondary, often Incumbent Friction, used to enrich not to define demand. Skip store backends that are not normally usable (e.g. fragile Play paths) on the default live path.
_Avoid_: Seed app list as the primary store strategy, using store reviews as the primary cold-start for Demand Signal

**Brief**:
Enriched Analysis Pass output: Pain Point + Evidence, inferred Target Market, Competitive Landscape, status-quo spend signals, Delivery Cost, difficulty S/M/L. MVP sketch optional in v1.
_Avoid_: Opportunity report, idea list, ChatGPT-style market blurb

**Run Report**:
The Builder-facing polished Markdown artifact assembled after per-cluster Analysis Pass outcomes return — Briefs plus Hollow rejections, readable rather than a raw `RunArtifact` dump. Written under a time-based run folder. Produced by a Report Agent (or equivalent Skill step) that integrates sub-agent results; it does not re-judge Hollow vs Brief and does not invent Evidence.
_Avoid_: Opportunity report, raw RunArtifact dump as the Builder deliverable, ChatGPT-style market blurb
