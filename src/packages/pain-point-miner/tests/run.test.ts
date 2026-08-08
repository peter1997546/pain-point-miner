import { describe, expect, it } from "vitest";
import { createPainPointMiner } from "../index.js";
import { createTestSignalSources, knownEvidence } from "./fixtures.js";

describe("PainPointMiner.run", () => {
  it("accepts empty Intent and returns quotable, linkable Evidence from fixture Signal Sources", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
    });

    const artifact = await miner.run({});

    expect(artifact.intent).toEqual({});
    expect(artifact.evidence).toEqual([...knownEvidence]);
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
    });

    const artifact = await miner.run();

    expect(artifact.intent).toEqual({});
    expect(artifact.evidence).toEqual([...knownEvidence]);
  });
});
