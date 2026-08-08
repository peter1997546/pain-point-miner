/**
 * Optional free-text fields the Builder may fill.
 * Empty Intent is valid — documented default is `{}`.
 */
export type Intent = {
  theme?: string;
  productShape?: string;
  constraints?: string;
  hardNos?: string;
  successDefinition?: string;
};

/** Input to `PainPointMiner.run`. Omitted / `{}` uses empty Intent defaults. */
export type RunInput = {
  intent?: Intent;
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
};

/** Condensed public result of a mining run. */
export type RunArtifact = {
  intent: Intent;
  evidence: EvidenceRef[];
};

/** Injectable Signal Source port (fixtures in tests; live adapters later). */
export type SignalSource = {
  readonly name: string;
  collect(intent: Intent): Promise<readonly EvidenceRef[]>;
};

export type PainPointMinerDeps = {
  signalSources: readonly SignalSource[];
};

export type PainPointMiner = {
  run(input?: RunInput): Promise<RunArtifact>;
};
