# Entry Catalog is free, no-token, Cloud-reachable sources

Reddit public JSON is blocked on typical Cloud / datacenter paths, and requiring Reddit or Product Hunt credentials contradicts a Builder path that must work without paid APIs or required tokens. Entry Catalog cold-start is therefore Hacker News (Algolia), Lobsters listings, Lemmy **lemmy.world** search, Dev.to tag listings, and Discourse search on the verified hosts `meta.discourse.org`, `forum.cursor.com`, `forum.gitlab.com`, `community.openai.com`, and `discuss.huggingface.co`. Apple App Store reviews remain Store Second Pass enrichment, not primary demand cold-start. Default live path skips sources that are not normally usable without tokens (Reddit, Product Hunt, fragile Play). This supersedes ADR-0010’s Reddit-primary Entry Catalog.

**Status**: accepted  
**Supersedes**: ADR-0010
