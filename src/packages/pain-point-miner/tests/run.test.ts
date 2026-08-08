import { describe, expect, it } from "vitest";
import { createFixtureEmbeddings, createPainPointMiner } from "../index.js";
import { createTestSignalSources, knownEvidence } from "./fixtures.js";

describe("PainPointMiner.run", () => {
  it("accepts empty Intent and returns quotable, linkable Evidence from fixture Signal Sources", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
      embeddings: createFixtureEmbeddings(),
    });

    const artifact = await miner.run({});

    expect(artifact.intent).toEqual({});
    expect(artifact.evidence).toEqual([...knownEvidence]);
    expect(artifact.candidateClusters.length).toBeGreaterThan(0);
    expect(artifact.gatedClusters).toEqual([]);
    expect(artifact.saturationStopped).toBe(false);
    // Analysis Pass omitted — no Briefs / Hollow judgments; filter view empty.
    expect(artifact.analysisOutcomes).toEqual([]);
    expect(artifact.briefs).toEqual([]);
    expect(artifact.hollowRejections).toEqual([]);
    expect(artifact.visibleBriefs).toEqual([]);
    expect(artifact.hiddenByCompetitionFilter).toEqual([]);
    expect(artifact.sourceDegradationNotes).toEqual([]);
    for (const item of artifact.evidence) {
      expect(item.quote.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.signalSource.length).toBeGreaterThan(0);
      expect(item).not.toHaveProperty("rawCorpus");
      expect(item).not.toHaveProperty("rawHtml");
    }
    expect(artifact).not.toHaveProperty("rawCorpus");
  });

  it("treats omitted input the same as empty Intent with documented defaults", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
      embeddings: createFixtureEmbeddings(),
    });

    const artifact = await miner.run();

    expect(artifact.intent).toEqual({});
    expect(artifact.evidence).toEqual([...knownEvidence]);
  });

  it("degrades gracefully when one Signal Source throws, keeping Evidence from succeeding sources", async () => {
    const failingSource = (name: string, message: string) => ({
      name,
      async collect() {
        throw new Error(message);
      },
    });
    const miner = createPainPointMiner({
      signalSources: [
        failingSource("broken-before", "simulated Signal Source outage"),
        ...createTestSignalSources(),
        failingSource("broken-after", "another Signal Source outage"),
      ],
      embeddings: createFixtureEmbeddings(),
    });

    const artifact = await miner.run({});

    expect(artifact.evidence).toEqual([...knownEvidence]);
    expect(artifact.intent).toEqual({});
    expect(artifact.candidateClusters.length).toBeGreaterThan(0);
    expect(artifact.gatedClusters).toEqual([]);
    expect(artifact.saturationStopped).toBe(false);
    expect(artifact.analysisOutcomes).toEqual([]);
    expect(artifact.briefs).toEqual([]);
    expect(artifact.hollowRejections).toEqual([]);
    expect(artifact.visibleBriefs).toEqual([]);
    expect(artifact.hiddenByCompetitionFilter).toEqual([]);
    expect(artifact.sourceDegradationNotes).toEqual([
      'Signal Source "broken-before" degraded: simulated Signal Source outage',
      'Signal Source "broken-after" degraded: another Signal Source outage',
    ]);
  });
});
