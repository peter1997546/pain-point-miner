# Analysis Pass runs in the Cursor agent, not a product LLM API

Hollow vs Brief judgment and Brief enrichment are AI work (ADR-0003 / ADR-0011), but the Builder’s path is Cursor Cloud Agent / Skill sub-agents — one gated Candidate Cluster per agent — not a shipped live LLM HTTP adapter. `createLlmAnalysisPass` / OpenAI-compatible LLM clients may exist for tests or experiments; they are **not** the product Analysis Pass surface for now. Injectable `AnalysisPass` doubles remain valid in CI.
