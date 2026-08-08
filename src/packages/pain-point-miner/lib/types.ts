/**
 * Optional free-text fields the Builder may fill.
 * Empty Intent is valid — documented default is `{}`.
 * Filled fields must not whitelist or drop Signal Sources (ADR-0004 / ADR-0007).
 */
export type Intent = {
  /** Optional broad directional preference (e.g. "AI automation"). */
  theme?: string;
};

/** Input to `PainPointMiner.run`. Omitted / `{}` uses empty Intent defaults. */
export type RunInput = {
  intent?: Intent;
  /** Count Gate threshold; default Evidence Count ≥ 5. */
  countGateThreshold?: number;
  /** Saturation Stop K; default halt once 20 Count-Gated clusters exist. */
  saturationStopK?: number;
};

/**
 * Quotable, linkable Evidence reference on the public `RunArtifact`.
 * The raw scrape corpus stays internal — not part of this contract.
 */
export type EvidenceRef = {
  id: string;
  quote: string;
  url: string;
  signalSource: string;
  /**
   * Optional structural clustering key when the crawler knows a shared
   * complaint identity (e.g. mentioned app id, normalized topic id).
   * Same key assists merges together with meaning similarity — it is not a
   * board/source bucket that merges unrelated Evidence alone.
   */
  structuralKey?: string;
};

/** Code-grouped Evidence treated as one underlying complaint for counting. */
export type CandidateCluster = {
  id: string;
  evidence: EvidenceRef[];
  /** Distinct Evidence items in this cluster — computed in code. */
  evidenceCount: number;
  /** True when Evidence Count meets the Count Gate (analysis-ready). */
  passedCountGate: boolean;
};

/** Condensed public result of a mining run. */
export type RunArtifact = {
  intent: Intent;
  evidence: EvidenceRef[];
  /** All Candidate Clusters formed from collected Evidence. */
  candidateClusters: CandidateCluster[];
  /**
   * Clusters that passed the Count Gate (analysis-ready).
   * Clusters below the gate are omitted here but remain on `candidateClusters`.
   */
  gatedClusters: CandidateCluster[];
  /** True when mining halted because Saturation Stop K was reached. */
  saturationStopped: boolean;
};

/** Injectable Signal Source port (fixtures in tests; live adapters later). */
export type SignalSource = {
  readonly name: string;
  collect(): Promise<readonly EvidenceRef[]>;
};

/**
 * Injectable embedding port for meaning similarity.
 * Maps quote texts (aligned to Evidence order at the call site) to vectors.
 */
export type Embeddings = {
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
};

export type PainPointMinerDeps = {
  signalSources: readonly SignalSource[];
  embeddings: Embeddings;
  /** Cosine threshold for meaning merges; default 0.8. */
  meaningSimilarityThreshold?: number;
  /**
   * Cosine floor for merges assisted by a shared structuralKey; default 0.5.
   * Structural keys never merge orthogonal meanings by themselves.
   */
  structuralKeySimilarityThreshold?: number;
};

export type PainPointMiner = {
  run(input?: RunInput): Promise<RunArtifact>;
};

export const DEFAULT_COUNT_GATE_THRESHOLD = 5;
export const DEFAULT_SATURATION_STOP_K = 20;
export const DEFAULT_MEANING_SIMILARITY_THRESHOLD = 0.8;
export const DEFAULT_STRUCTURAL_KEY_SIMILARITY_THRESHOLD = 0.5;
