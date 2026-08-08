import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPainPointMiner,
  formatRunArtifact,
} from "../index.js";
import { createTestSignalSources, knownEvidence } from "./fixtures.js";
import { runCli } from "../cli.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Script CLI artifact formatting", () => {
  it("emits JSON suitable for local inspection", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
    });
    const artifact = await miner.run({});

    const json = formatRunArtifact(artifact, "json");
    const parsed = JSON.parse(json) as {
      intent: unknown;
      evidence: typeof knownEvidence;
    };

    expect(parsed.intent).toEqual({});
    expect(parsed.evidence).toEqual([...knownEvidence]);
  });

  it("emits Markdown with quotable Evidence and links", async () => {
    const miner = createPainPointMiner({
      signalSources: createTestSignalSources(),
    });
    const artifact = await miner.run({});

    const markdown = formatRunArtifact(artifact, "markdown");

    expect(markdown).toContain("# Pain Point Miner RunArtifact");
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain(knownEvidence[0]!.quote);
    expect(markdown).toContain(knownEvidence[0]!.url);
    expect(markdown).toContain(knownEvidence[1]!.quote);
    expect(markdown).toContain(knownEvidence[1]!.url);
  });
});

describe("Script CLI", () => {
  it("runs the same seam and writes JSON to a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppm-cli-"));
    tempDirs.push(dir);
    const outPath = join(dir, "artifact.json");

    const code = await runCli(["--format", "json", "--out", outPath], {
      signalSources: createTestSignalSources(),
      stdout: { write() {} },
    });

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      evidence: { id: string }[];
    };
    expect(written.evidence.map((e) => e.id)).toEqual(
      knownEvidence.map((e) => e.id),
    );
  });

  it("prints Markdown to stdout by default", async () => {
    const chunks: string[] = [];
    const code = await runCli(["--format", "markdown"], {
      signalSources: createTestSignalSources(),
      stdout: {
        write(chunk: string) {
          chunks.push(chunk);
          return true;
        },
      },
    });

    expect(code).toBe(0);
    const output = chunks.join("");
    expect(output).toContain("# Pain Point Miner RunArtifact");
    expect(output).toContain(knownEvidence[0]!.url);
  });
});
