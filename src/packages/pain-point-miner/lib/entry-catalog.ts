/**
 * Entry Catalog v1 cold-start targets (ADR-0010 / CONTEXT.md).
 * Product Hunt and Indie Hackers are Follow-on only — not listed here.
 */

/** Reddit boards mined in the first cold-start wave. */
export const ENTRY_CATALOG_REDDIT_BOARDS = [
  "smallbusiness",
  "freelance",
  "sysadmin",
  "webdev",
  "sales",
  "marketing",
  "ecommerce",
] as const;

/** Demand-oriented Reddit query patterns (wish / tool / workaround). */
export const ENTRY_CATALOG_REDDIT_DEMAND_QUERIES = [
  "wish",
  "tool for",
  "why no",
  "spreadsheet",
  "how do you handle",
] as const;

/**
 * Large founder boards deprioritized in the first wave — kept for clarity so
 * cold-start adapters never treat them as primary Entry Catalog targets.
 */
export const ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS = [
  "Entrepreneur",
  "startups",
  "startup",
] as const;

/** Ask HN–style frustration / wish searches for the HN first wave. */
export const ENTRY_CATALOG_HN_ASK_QUERIES = [
  "I wish",
  "is there a tool",
  "how do you handle",
  "frustrated with",
  "workaround",
] as const;
