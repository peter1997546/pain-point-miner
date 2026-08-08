# Run Report assembled by a Report Agent after per-cluster fan-out

The Builder deliverable is a **Run Report**: polished Markdown under a time-based run folder, not a raw `RunArtifact` dump. After Analysis Pass sub-agents return Hollow/Brief outcomes for each gated Candidate Cluster, a Report Agent (or equivalent Skill step) integrates those results into one readable report. It does not re-judge Hollow vs Brief and does not invent Evidence.
