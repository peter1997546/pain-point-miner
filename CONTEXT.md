# Pain Point Miner

Helps an indie builder who does not already have a crisp idea discover *evidence-grounded* Pain Points from public signals — a Miner, not a Verifier of a pre-held use case, and not an LLM brainstorm that recycles generic startup directions. v1 is a personal script or skill; Source Catalog depth is for developer-familiar product shapes (apps / web), with placeholders elsewhere.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The primary job of this tool: find Pain Points from real Signal Sources. It must not require a concrete use case or crisp Target Market up front (that would make it a Verifier). A broad Theme is allowed as a soft steer.
_Avoid_: Verifier, idea validator, brainstormer

**Intent**:
The Builder’s free-text answers that steer a run without presupposing a product idea. Includes product shape, Builder constraints, hard nos, success definition, and optionally a Theme. A crisp Target Market or concrete use case is not required.
_Avoid_: Structured intake, intake form, requirements form, dropdown-only intake

**Theme**:
A broad directional preference in the Intent (e.g. “AI automation”, “提升效率”). It is *not* a use case, workflow, or Target Market — naming a Theme does not mean the Builder already knows what to build.
_Avoid_: Use case, scenario, problem statement

**Target Market**:
The people a Pain Point / Brief is about — including geography / locale when it matters. Discovered or refined from Evidence during a run. Any market is valid when Evidence supports it.
_Avoid_: Niche (unless used informally), segment sheet

**Evidence**:
A concrete public artifact (post, review, thread, issue) that supports a Pain Point — quotable and linkable. Model-only speculation is discarded.
_Avoid_: Anecdote (unsourced), “market insight” without a source

**Pain Point**:
A recurring unmet need evidenced by a substantial volume of real public complaints (Evidence) — “不少人在抱怨.” Discovering Pain Points is the Miner’s primary success criterion. Whether it is solvable by coding is *not* required for something to count as a Pain Point.
_Avoid_: Problem (as the formal name), idea, brainstorm topic, generic direction

**Analysis Pass**:
A later AI step that takes mined Pain Points and goes deeper — e.g. whether software can address them, Competitive Landscape, Delivery Cost, status-quo spend, rough MVP shape. Produces or enriches Briefs; it does not invent Pain Points.
_Avoid_: Brainstorm pass, ideation

**Software Fit**:
A judgment from the Analysis Pass about whether a Pain Point looks addressable by software a Builder could ship (vs. mainly offline ops, regulation, capital-intensive, etc.). Low Software Fit is labeled for the Builder — it does not erase the Pain Point.
_Avoid_: Feasibility (overloaded), buildability

**Competitive Landscape**:
An annotation (usually from the Analysis Pass) about existing offerings and how strongly they already serve the relevant Target Market (quality, adoption, local penetration — not merely country of origin). A US product that already dominates Hong Kong (e.g. Stripe-class penetration) counts as real competition; a geo label alone is not an opportunity.
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
A judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Builder’s Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
The Builder’s post-hoc cutoff for competition density: the run emits the full annotated set first; the Builder then hides or ignores Briefs above a tolerance they choose.
_Avoid_: Auto-exclude, kill list, Intent-time hard kill

**Delivery Cost**:
A rough read from the Analysis Pass of what it would cost the Builder to build and run a plausible solution — any material cost driver (hosted models, third-party APIs, labor-heavy ops, compliance, etc.). Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection, “LLM cost” (too narrow as the name)

**Source Catalog**:
A tool-provided map from product shapes / domains to the set of Signal Sources to cover. v1 is deep only for developer-familiar shapes (mobile app, web app / SaaS-style); other domains are explicit placeholders with lower confidence.
_Avoid_: Universal industry coverage, single secondary forum

**Signal Source**:
One channel mined for Evidence. A run always includes Reddit plus the relevant Source Catalog set for the Intent’s product shape.
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
The enriched output after an Analysis Pass on a Pain Point: inferred Target Market, Competitive Landscape, Software Fit, demand / status-quo spend signals, Delivery Cost, rough MVP shape when Software Fit is plausible — still Evidence-grounded, not a vague essay.
_Avoid_: Opportunity report, idea list, feature request, ChatGPT-style market blurb
