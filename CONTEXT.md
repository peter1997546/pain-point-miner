# Pain Point Miner

Helps an indie builder discover real Pain Points by mining public signals and analyzing them — a Miner that *finds*, not a form that *restricts* the Builder into a tiny preset search. Not a Verifier of a pre-held use case, and not an LLM brainstorm that invents generic directions. v1 is a personal script or skill; Source Catalog depth is for developer-familiar shapes (apps / web), with placeholders elsewhere.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The job of this tool: crawl Signal Sources, surface candidate clusters, and analyze them into real Pain Points. Success is finding truth in the wild — not asking the Builder for enough restrictions that only N results can appear.
_Avoid_: Verifier, restricted search form, brainstormer

**Intent**:
Optional free-text steers the Builder may give (e.g. a broad Theme). It must not become a pile of restrictions that pre-decides what can be found. Empty or near-empty Intent is valid; the tool still runs against its Source Catalog.
_Avoid_: Intake form, requirements form, restriction sheet

**Theme**:
An optional broad directional preference (e.g. “AI automation”, “提升效率”). Not a use case, workflow, or Target Market. Never required to run.
_Avoid_: Use case, scenario, problem statement

**Target Market**:
The people a Pain Point / Brief is about — including geography / locale when it matters. Discovered or refined from Evidence during a run.
_Avoid_: Niche (unless used informally), segment sheet

**Evidence**:
A concrete public artifact (post, review, thread, issue) pulled from a Signal Source — quotable and linkable. Produced by crawling (code), not by model invention.
_Avoid_: Anecdote (unsourced), “market insight” without a source

**Evidence Count**:
The number N of distinct Evidence items supporting a candidate cluster. Computed by code after crawling. A Count Gate (e.g. N ≥ 5) is a deterministic threshold — this is the kind of check coding can do.
_Avoid_: “Popularity score” (vague), engagement metrics as a substitute for complaint volume

**Count Gate**:
The deterministic rule that a candidate needs Evidence Count above a threshold before it is worth deeper analysis. Code can evaluate it; it does not judge whether the complaints are substantive vs hollow.
_Avoid_: Quality filter, vibe check

**Pain Point**:
A recurring unmet need that (1) passes the Count Gate via real Evidence, and (2) survives AI judgment that it is not hollow / generic (“虛”). Volume alone is not enough; hollowness alone is not decided by counting posts.
_Avoid_: Problem (as the formal name), idea, brainstorm topic

**Analysis Pass**:
The AI steps that coding cannot honestly do: judging whether a high-N cluster is substantive vs 虛, then enriching survivors into Briefs (Competitive Landscape, Delivery Cost, status-quo spend, rough MVP shape, etc.). Does not invent Evidence or Pain Points from thin air.
_Avoid_: Brainstorm pass, ideation, “Software Fit” (retired — was a misunderstanding)

**Competitive Landscape**:
An annotation from the Analysis Pass about existing offerings and how strongly they already serve the relevant Target Market (quality, adoption, local penetration — not merely country of origin). Stripe-class penetration in Hong Kong counts as real competition; a geo label alone is not an opportunity.
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
A judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Builder’s Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
The Builder’s post-hoc cutoff for competition density: the run emits the full annotated set first; the Builder then hides or ignores items above a tolerance they choose.
_Avoid_: Auto-exclude, kill list, Intent-time hard kill

**Delivery Cost**:
A rough read from the Analysis Pass of what it would cost the Builder to build and run a plausible solution — any material cost driver. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection, “LLM cost” (too narrow as the name)

**Source Catalog**:
The tool-provided set of Signal Sources to mine. v1 is deep for developer-familiar app/web sources; other domains are placeholders. Default runs cover this catalog — the Builder is not asked to whitelist sources to keep result count small.
_Avoid_: Universal industry coverage, user-supplied source list as a gate

**Signal Source**:
One channel mined for Evidence (e.g. Reddit, app store reviews).
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
The enriched output of the Analysis Pass on a Pain Point: inferred Target Market, Competitive Landscape, demand / status-quo spend signals, Delivery Cost, rough next-build shape — still grounded in Evidence.
_Avoid_: Opportunity report, idea list, feature request, ChatGPT-style market blurb
