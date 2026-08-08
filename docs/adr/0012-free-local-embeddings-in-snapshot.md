# Free local embeddings baked into the Cloud environment snapshot

Candidate Cluster meaning similarity needs real embeddings (ADR-0005), but the product path must not depend on a paid embedding API. An OpenAI-compatible embeddings adapter may exist in the repo for experiments; it is **not** the Builder-facing requirement. v1 uses a mid-size free/open embedding model, downloaded during Cloud Agent **environment install/build** and baked into the snapshot so subsequent runs do not re-download every time. Fixture hash-vectors remain for tests only.
