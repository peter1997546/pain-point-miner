# Pain Point Miner

Helps an indie builder who does not already have a crisp idea discover underserved problems worth turning into a project — for personal use as a script or skill first.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Intent**:
The Builder’s free-text answers to a small set of prompts that steer a run. Required prompts cover product shape, Builder constraints, preferred themes, hard nos, and what “success” means. A crisp Target Market is optional — often the Builder does not have one yet.
_Avoid_: Structured intake, intake form, requirements form, dropdown-only intake

**Target Market**:
The people a Problem / Brief is about — including geography / locale when it matters. Frequently *discovered or refined during a run*, not supplied up front. Any market is valid, including builders/founders when the evidence points there.
_Avoid_: Niche (unless used informally), segment sheet

**Problem**:
A specific unmet need — who hurts, where, and how badly — without prescribing a product yet. May introduce or sharpen the Target Market when the Builder did not start with one.
_Avoid_: Pain point (as a formal output name), complaint, idea

**Competitive Landscape**:
An annotation on a Brief about existing offerings and how strongly they already serve the relevant Target Market (quality, adoption, local penetration — not merely country of origin). A US product that already dominates Hong Kong (e.g. Stripe-class penetration) counts as real competition; a geo label alone is not an opportunity.
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
A judgment inside the Competitive Landscape that the relevant Target Market is already well served. Surfaced for the Builder’s Competition Filter — not a system hard-kill.
_Avoid_: Incumbent (unless dominance is the point)

**Competition Filter**:
The Builder’s own cutoff for how much competition they are willing to tolerate (e.g. hide / ignore Briefs above a density they choose). The system ranks and annotates; it does not silently drop high-competition Briefs unless the Builder applies the filter.
_Avoid_: Auto-exclude, kill list

**Delivery Cost**:
A rough read of what it would cost the Builder to build and run a plausible solution — any material cost driver (hosted models, third-party APIs, labor-heavy ops, compliance, etc.), not a single technology. Used to kill ideas that look attractive until unit cost shows up. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection, “LLM cost” (too narrow as the name)

**Source Catalog**:
A maintained map, provided by the tool, from domains / product shapes to the *set* of common Signal Sources worth covering (often more than one native source — e.g. apps → App Store plus other usual places). Builders are not expected to know the full set for every industry.
_Avoid_: Single secondary forum, scrape list (implementation wording)

**Signal Source**:
One channel mined for evidence. A run always includes Reddit plus the relevant set from the Source Catalog for the Intent’s product shape / themes.
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
The unit of output from a successful run: a Problem (with a Target Market, inferred if needed) plus build-oriented context — rough MVP shape, Competitive Landscape, demand signals, Delivery Cost — so the Builder can apply their Competition Filter and decide whether to start.
_Avoid_: Opportunity report, idea list, feature request
