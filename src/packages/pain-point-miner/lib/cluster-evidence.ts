import { cosineSimilarity } from "./cosine.js";
import { signalMixFromEvidence } from "./signal-mix.js";
import type { CandidateCluster, EvidenceRef } from "./types.js";

class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(index: number): number {
    let current = index;
    while (this.parent[current] !== current) {
      const parent = this.parent[current]!;
      this.parent[current] = this.parent[parent]!;
      current = this.parent[current]!;
    }
    return current;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent[rootB] = rootA;
    }
  }
}

export type ClusterEvidenceOptions = {
  embeddings: readonly (readonly number[])[];
  meaningSimilarityThreshold: number;
  structuralKeySimilarityThreshold: number;
  countGateThreshold: number;
};

/**
 * Groups Evidence by structural keys plus meaning similarity (embedding cosine).
 * Shared-word overlap is not consulted.
 */
export function clusterEvidence(
  evidence: readonly EvidenceRef[],
  options: ClusterEvidenceOptions,
): CandidateCluster[] {
  if (evidence.length === 0) {
    return [];
  }
  if (options.embeddings.length !== evidence.length) {
    throw new Error(
      `Embedding count ${options.embeddings.length} does not match Evidence count ${evidence.length}`,
    );
  }

  const uf = new UnionFind(evidence.length);

  for (let i = 0; i < evidence.length; i += 1) {
    for (let j = i + 1; j < evidence.length; j += 1) {
      const left = evidence[i]!;
      const right = evidence[j]!;
      const similarity = cosineSimilarity(
        options.embeddings[i]!,
        options.embeddings[j]!,
      );
      const sameStructuralKey =
        left.structuralKey !== undefined &&
        left.structuralKey === right.structuralKey;
      const similarMeaning =
        similarity >= options.meaningSimilarityThreshold;
      const structuralAssist =
        sameStructuralKey &&
        similarity >= options.structuralKeySimilarityThreshold;
      if (similarMeaning || structuralAssist) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, EvidenceRef[]>();
  for (let i = 0; i < evidence.length; i += 1) {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(evidence[i]!);
    groups.set(root, list);
  }

  return [...groups.values()].map((members, index) => {
    const evidenceCount = members.length;
    return {
      id: `cluster-${index + 1}`,
      evidence: members,
      evidenceCount,
      passedCountGate: evidenceCount >= options.countGateThreshold,
      signalMix: signalMixFromEvidence(members),
    };
  });
}
