# Pain Point Miner

Helps an indie builder turn a loose interest into underserved market problems worth turning into a project — for personal use as a script or skill first.

## Language

**Builder**:
The person running this tool to find something worth building. Not the end customer of the eventual product unless the Target Market happens to be builders.
_Avoid_: User (ambiguous with end customer), customer (of this tool)

**Intent**:
The free-text description of what the Builder wants to explore (market, scale, constraints, taste). Guiding questions may prompt it; it is never a fixed dropdown form.
_Avoid_: Structured intake, intake form, requirements form

**Target Market**:
The people whose problems the Intent is aimed at — including geography / locale when it matters. Any market is valid, including builders/founders when the Intent says so; there is no separate “meta” mode.
_Avoid_: Niche (unless used informally), segment sheet

**Problem**:
A specific unmet need expressed by people in (or about serving) the Target Market — who hurts, where, and how badly — without prescribing a product yet.
_Avoid_: Pain point (as a formal output name), complaint, idea

**Competitive Landscape**:
An annotation on a Brief describing existing offerings relative to this Target Market: how good they are, who they actually serve, and gaps (e.g. US-only product while Intent is Hong Kong). Existence of a product elsewhere is not automatic disqualification.
_Avoid_: Competitor list (raw names without fit), market map

**Mature Solution**:
A judgment inside the Competitive Landscape that the Target Market is already well served. It informs ranking and human cut decisions; it is not a hard auto-filter.
_Avoid_: Incumbent (unless dominance is the point)

**Delivery Cost**:
A rough read of what it would cost the Builder to build and run a plausible solution (especially model inference, APIs, and other variable cost) — used to kill ideas that look attractive until unit cost shows up. Not a revenue or profit forecast.
_Avoid_: Profit estimate, TAM, ARR projection

**Signal Source**:
A channel mined for evidence. A run always includes Reddit plus one Intent-routed native source for that product/domain (e.g. App Store for mobile apps) — not “a random second forum.”
_Avoid_: Corpus, scrape target (implementation wording)

**Brief**:
The unit of output from a successful run: a Problem plus build-oriented context (who it’s for, rough MVP shape, Competitive Landscape, difficulty / demand signals, Delivery Cost) so the Builder can decide whether to start.
_Avoid_: Opportunity report, idea list, feature request
