export { applyCompetitionFilter } from "./lib/competition-filter.js";
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
export { signalMixFromEvidence } from "./lib/signal-mix.js";
export type {
  AnalysisOutcome,
  AnalysisPass,
  AnalysisPassInput,
  Brief,
  CandidateCluster,
  Difficulty,
  Embeddings,
  EvidenceRef,
  FollowOnFetcher,
  FollowOnKind,
  FollowOnTarget,
  HollowRejection,
  Intent,
  MentionedApp,
  PainPointMiner,
  PainPointMinerDeps,
  RunArtifact,
  RunInput,
  SignalKind,
  SignalMix,
  SignalSource,
  StoreReviewSource,
} from "./lib/types.js";
export {
  DEFAULT_COUNT_GATE_THRESHOLD,
  DEFAULT_SATURATION_STOP_K,
  FORUM_SIGNAL_SOURCES,
  mentionedAppKey,
} from "./lib/types.js";
