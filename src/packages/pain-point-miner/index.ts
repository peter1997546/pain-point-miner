export { createPainPointMiner } from "./lib/create-pain-point-miner.js";
export { createFixtureEmbeddings } from "./lib/fixture-embeddings.js";
export {
  createFixtureFollowOnFetcher,
  createFixtureStoreReviewSource,
} from "./lib/fixture-follow-on-store.js";
export {
  createDefaultFixtureFollowOnFetcher,
  createDefaultFixtureStoreReviewSource,
  createFixtureSignalSources,
  defaultFixtureEvidence,
  defaultFixtureFollowOnPages,
  defaultFixtureStoreReviews,
} from "./lib/fixture-signal-source.js";
export {
  formatRunArtifact,
  type ArtifactFormat,
} from "./lib/format-run-artifact.js";
export type {
  CandidateCluster,
  Embeddings,
  EvidenceRef,
  FollowOnFetcher,
  FollowOnKind,
  FollowOnTarget,
  Intent,
  MentionedApp,
  PainPointMiner,
  PainPointMinerDeps,
  RunArtifact,
  RunInput,
  SignalSource,
  StoreReviewSource,
} from "./lib/types.js";
export {
  DEFAULT_COUNT_GATE_THRESHOLD,
  DEFAULT_SATURATION_STOP_K,
  FORUM_SIGNAL_SOURCES,
  mentionedAppKey,
} from "./lib/types.js";
