import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CaseResultArtifactV2Schema,
  CaseResultArtifactSchema,
  RunSummaryArtifactSchema,
  StoredTraceArtifactSchema
} from "../../src/contracts/artifacts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);

describe("checked-in sample artifacts", () => {
  it("remain parseable after schema evolution", async () => {
    const storedCases = JSON.parse(await readFile(
      resolve(repositoryRoot, "results/sample/cases.json"),
      "utf8"
    )) as unknown;
    const cases = z.array(CaseResultArtifactSchema).parse(storedCases);

    const lines = (await readFile(
      resolve(repositoryRoot, "results/sample/events.jsonl"),
      "utf8"
    )).trim().split("\n").map((line) =>
      StoredTraceArtifactSchema.parse(JSON.parse(line) as unknown)
    );
    const summary = RunSummaryArtifactSchema.parse(JSON.parse(await readFile(
      resolve(repositoryRoot, "results/sample/summary.json"),
      "utf8"
    )) as unknown);

    expect(cases).toHaveLength(5);
    expect(lines).toHaveLength(15);
    expect(new Set(lines.map((line) => line.case_id)).size).toBe(5);
    expect(summary.run_id).toBe(lines[0]?.run_id);
  });

  it("rejects incomplete or internally mismatched v2 case artifacts", async () => {
    const storedCases = JSON.parse(await readFile(
      resolve(repositoryRoot, "results/sample/cases.json"),
      "utf8"
    )) as unknown;
    const legacy = z.array(CaseResultArtifactSchema).parse(storedCases)[0];
    if (!legacy || legacy.schema_version !== "gametestlab.case-result.v1") {
      throw new Error("expected a legacy case-result fixture");
    }

    const sha256 = "0".repeat(64);
    const v2 = {
      ...legacy,
      schema_version: "gametestlab.case-result.v2" as const,
      evaluation: {
        ...legacy.evaluation,
        schema_version: "gametestlab.evaluation.v2" as const
      },
      input_hashes: {
        case_sha256: sha256,
        oracle_sha256: sha256,
        game_directory_sha256: sha256
      },
      browser: {
        ...legacy.browser,
        network: [],
        diagnostics: legacy.browser.diagnostics.map((message) => ({
          source: "runner" as const,
          message,
          action_index: null,
          frame_index: null,
          elapsed_ms: 0
        }))
      }
    };
    expect(CaseResultArtifactV2Schema.safeParse(v2).success).toBe(true);
    expect(CaseResultArtifactV2Schema.safeParse({
      ...v2,
      evaluation: { ...v2.evaluation, case_id: "different-case" }
    }).success).toBe(false);
    expect(CaseResultArtifactV2Schema.safeParse({
      ...v2,
      observations: []
    }).success).toBe(false);
  });
});
