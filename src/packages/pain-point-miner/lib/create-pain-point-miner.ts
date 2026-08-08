import type {
  EvidenceRef,
  Intent,
  PainPointMiner,
  PainPointMinerDeps,
  RunArtifact,
  RunInput,
} from "./types.js";

const EMPTY_INTENT: Intent = {};

export function createPainPointMiner(
  deps: PainPointMinerDeps,
): PainPointMiner {
  return {
    async run(input: RunInput = {}): Promise<RunArtifact> {
      const intent = input.intent ?? EMPTY_INTENT;
      const evidence: EvidenceRef[] = [];

      for (const source of deps.signalSources) {
        // Intent is echoed on the artifact but does not select Signal Sources.
        const batch = await source.collect();
        evidence.push(...batch);
      }

      return { intent, evidence };
    },
  };
}
