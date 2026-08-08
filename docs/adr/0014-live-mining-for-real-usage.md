# Real usage mines live; fixtures are for tests only

Any real Builder run (Skill on Cloud Agent or equivalent) must crawl live Signal Sources. Fixture Signal Sources / Follow-on / Store adapters exist so tests and CI can stay offline deterministic — they are not a product mining mode. “Should this run use fixtures?” is not a Builder intake question for real usage. v1 live path uses the free, no-token Entry Catalog in ADR-0016 (HN, Lobsters, Lemmy, Dev.to, Discourse whitelist) plus App Store Store Second Pass; token-gated deepenings (e.g. Product Hunt) are skipped until credentials exist and must not block the run. Reddit is not assumed token-free on Cloud paths.

**Status**: accepted（Entry examples superseded in part by ADR-0016）
