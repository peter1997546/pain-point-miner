# Pain Point Miner

Helps an indie builder who does not already have a crisp idea discover *evidence-grounded*, startable problems — a Miner over public signals, not a Verifier of a pre-held idea, and not an LLM brainstorm that recycles generic startup directions. v1 is a personal script or skill; Source Catalog depth is for developer-familiar product shapes (apps / web), with placeholders elsewhere.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Miner**:
The job of this tool: discover Problems from real Signal Sources. Requiring a concrete use case or crisp Target Market up front would turn it into a Verifier — out of scope.
_Avoid_: Verifier, idea validator, brainstormer

**Intent**:
The Builder’s free-text answers that *steer* a run without presupposing a product idea. Required: product shape, Builder constraints, hard nos, and what success means. Preferred theme may be broad or thin; a crisp Target Market or use case is not required.
_Avoid_: Structured intake, intake form, requirements form, dropdown-only intake

**Target Market**:
The people a Problem / Brief is about — including geography / locale when it matters. Discovered or refined from Evidence during a run. Any market is valid when Evidence supports it.
_Avoid_: Niche (unless used informally), segment sheet

**Evidence**:
A concrete public artifact (post, review, thread, issue) that supports a Problem — quotable and linkable. No Evidence means no Brief; model-only speculation is discarded.
_Avoid_: Anecdote (unsourced), “market insight” without a source

**Problem**:
A specific unmet need — who hurts, where, and how badly — grounded in Evidence, without prescribing a product yet. May introduce or sharpen the Target Market when the Builder did not start with one. Must be specific enough that a Builder could start work — not a recycled generic direction (“AI for SMEs”, “marketplace for X”).
_Avoid_: Pain point (as a formal output name), complaint, idea, brainstorm topic

**Competitive Landscape**:
An annotation on a Brief about existing offerings and how strongly they already serve the relevant Target Market (quality, adoption, local penetration — not merely country of origin). A US product that already dominates Hong Kong (e.g. Stripe-class penetration) counts as real competition; a geo label alone is not an opportunity.
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
A judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Builder’s Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
The Builder’s own cutoff for how much competition they are willing to tolerate. The system ranks and annotates; it does not silently drop high-competition Briefs unless the Builder applies the filter.
_Avoid_: Auto-exclude, kill list

**Delivery Cost**:
A rough read of what it would cost the Builder to build and run a plausible solution — any material cost driver (hosted models, third-party APIs, labor-heavy ops, compliance, etc.). Used to kill ideas that look attractive until unit cost shows up. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection, “LLM cost” (too narrow as the name)

**Source Catalog**:
A tool-provided map from product shapes / domains to the set of Signal Sources to cover. v1 is deep only for developer-familiar shapes (mobile app, web app / SaaS-style); other domains are explicit placeholders with lower confidence.
_Avoid_: Universal industry coverage, single secondary forum

**Signal Source**:
One channel mined for Evidence. A run always includes Reddit plus the relevant Source Catalog set for the Intent’s product shape.
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
The unit of output: an Evidence-grounded Problem (with Target Market inferred if needed) plus build-oriented context — rough MVP shape, Competitive Landscape, demand / status-quo spend signals, Delivery Cost — specific enough to start, not a vague essay.
_Avoid_: Opportunity report, idea list, feature request, ChatGPT-style market blurb
