# Per-cluster Analysis Pass checklist

Use this only inside a **single** Candidate Cluster analysis step. Do not load sibling clusters or the mining `evidence[]` scrape here (ADR-0011).

## Input (cluster-scoped)

- `cluster.id`
- `cluster.evidence[]` — quotable + linkable items for **this** cluster only (may include `url` + `archivePermalink`)
- `cluster.evidenceCount` / `cluster.signalMix` (pre-analysis hint)
- Optional Intent (`theme`, `productShape`, `constraints`, `hardNos`, `successDefinition`) — preference notes only (e.g. Delivery Cost commentary); not a crawl whitelist

## Hollow vs Pain Point

Mark **Hollow** when complaints are wish-only with no scene / workaround / observable failure, and/or interchangeable platitudes that do not point at one concrete pain.

Otherwise emit a **Brief**.

## Brief fields (required)

| Field | Notes |
| --- | --- |
| `painPointSummary` | Concrete pain, grounded in this cluster’s Evidence |
| `evidenceLinks` | Links from this cluster’s Evidence. For **Reddit (via archive)** Evidence, include each item’s **Archive Permalink** (Builder-openable); canonical Reddit URL may also appear. Do not invent URLs. |
| `targetMarket` | Who hurts — geography/locale when Evidence supports it |
| `competitiveLandscape` | Existing offerings + fit / local penetration; Mature Solution as annotation |
| `statusQuoSpendSignals` | What people spend (money/time) today |
| `deliveryCost` | Rough build/run cost drivers — not TAM/ARR |
| `difficulty` | `S` \| `M` \| `L` |
| `signalMix` | Demand Signal vs Incumbent Friction counts (both may count toward N) |
| `competitionDensity` | Annotation for Competition Filter — never a silent hard-kill |

## Output shape

```ts
// Hollow
{ status: "hollow", clusterId, reason, signalMix }

// Pain Point Brief
{ status: "brief", brief: Brief }
```

Do not invent Evidence. Quote and link only what the cluster already carries.

Return the outcome to the parent / Report Agent. The Report Agent writes `report.md` via `writeSkillRunFolder` / `assembleRunReport` (formatter) — analysis subagents do not author the final Run Report.
