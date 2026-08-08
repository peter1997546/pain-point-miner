export { createPainPointMiner } from "./lib/create-pain-point-miner.js";
export { createFixtureEmbeddings } from "./lib/fixture-embeddings.js";
export {
  createFixtureSignalSources,
  defaultFixtureEvidence,
} from "./lib/fixture-signal-source.js";
export {
  formatRunArtifact,
  type ArtifactFormat,
} from "./lib/format-run-artifact.js";
export type {
  CandidateCluster,
  Embeddings,
  EvidenceRef,
  Intent,
  PainPointMiner,
  PainPointMinerDeps,
  RunArtifact,
  RunInput,
  SignalSource,
} from "./lib/types.js";
export {
  DEFAULT_COUNT_GATE_THRESHOLD,
  DEFAULT_SATURATION_STOP_K,
} from "./lib/types.js";
