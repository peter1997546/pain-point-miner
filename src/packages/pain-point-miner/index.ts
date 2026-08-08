export { applyCompetitionFilter } from "./lib/competition-filter.js";
export { createPainPointMiner } from "./lib/create-pain-point-miner.js";
export { createFixtureEmbeddings } from "./lib/fixture-embeddings.js";
export {
  createLocalEmbeddings,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  DEFAULT_LOCAL_EMBEDDINGS_CACHE_DIR,
  resolveLocalEmbeddingsCacheDir,
  type LocalEmbeddingExtractor,
  type LocalEmbeddingsInit,
} from "./lib/local-embeddings.js";
export {
  createOpenAiCompatibleEmbeddings,
  type OpenAiCompatibleEmbeddingsInit,
} from "./lib/openai-compatible-embeddings.js";
export {
  createLiveDiscoveryMiner,
  type LiveDiscoveryMinerDeps,
  type LiveEmbeddingsBackend,
} from "./lib/live-discovery-miner.js";
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
  ENTRY_CATALOG_DEPRIORITIZED_REDDIT_BOARDS,
  ENTRY_CATALOG_HN_ASK_QUERIES,
  ENTRY_CATALOG_REDDIT_BOARDS,
  ENTRY_CATALOG_REDDIT_DEMAND_QUERIES,
} from "./lib/entry-catalog.js";
export { createEntryCatalogSignalSources } from "./lib/entry-catalog-signal-sources.js";
export { createHackerNewsSignalSource } from "./lib/hacker-news-signal-source.js";
export {
  createFetchHttpClient,
  createRecordingAdapterHttpClient,
  createRecordingHttpClient,
  type AdapterHttpClient,
  type AdapterHttpRecordings,
  type JsonHttpClient,
} from "./lib/json-http-client.js";
export { createRedditSignalSource } from "./lib/reddit-signal-source.js";
export { createAppStoreReviewSource } from "./lib/app-store-review-source.js";
export { createPlayStoreReviewSource } from "./lib/play-store-review-source.js";
export { createStoreReviewSource } from "./lib/store-review-source.js";
export { createProductHuntFollowOnFetcher } from "./lib/product-hunt-follow-on.js";
export { createIndieHackersFollowOnFetcher } from "./lib/indie-hackers-follow-on.js";
export { createSourceCatalogFollowOnFetcher } from "./lib/source-catalog-follow-on.js";
export {
  formatRunArtifact,
  type ArtifactFormat,
} from "./lib/format-run-artifact.js";
export {
  createSkillOrchestrator,
  type SkillOrchestrator,
  type SkillOrchestratorDeps,
} from "./lib/skill-orchestrator.js";
export {
  toSkillMiningHandoff,
  type SkillMiningHandoff,
} from "./lib/skill-mining-handoff.js";
export {
  ANALYSIS_PASS_SYSTEM_PROMPT,
  createLlmAnalysisPass,
  type LlmAnalysisPassDeps,
} from "./lib/llm-analysis-pass.js";
export {
  createOpenAiCompatibleLlmClient,
  type LlmClient,
  type LlmCompletionRequest,
  type OpenAiCompatibleLlmClientInit,
} from "./lib/llm-client.js";
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
