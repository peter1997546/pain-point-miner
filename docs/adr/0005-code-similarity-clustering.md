# Code-side similarity for Candidate Clusters

Evidence is grouped into Candidate Clusters by coding-time similarity (structural keys and textual similarity), not by an LLM pass. Evidence Count and the Count Gate stay deterministic over those clusters. The Analysis Pass judges Hollow vs real after the Count Gate — it does not own primary clustering.
