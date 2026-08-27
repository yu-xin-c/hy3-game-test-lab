import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDatasetEntry, loadManifest } from "../../src/contracts/loaders";
import {
  ObservationSchema,
  PublicCaseSchema
} from "../../src/contracts/schemas";
import { validateDataset } from "../../scripts/validate-dataset";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);

describe("dataset schemas", () => {
  it("parses every manifest entry and passes cross-file validation", async () => {
    const manifest = await loadManifest(
      resolve(repositoryRoot, "datasets/manifest.json")
    );
    const entries = await Promise.all(
      manifest.cases.map((entry) => loadDatasetEntry(repositoryRoot, entry))
    );
    const summary = await validateDataset(repositoryRoot);

    expect(entries.map(({ publicCase }) => publicCase.id)).toEqual([
      "clean-control",
      "score-plus-two",
      "score-compensated",
      "hud-stale",
      "cross-layer-masked"
    ]);
    expect(summary).toEqual({
      case_count: 5,
      difficulty_counts: { D1: 2, D2: 1, D3: 2 },
      sample_kind_counts: { clean: 1, faulty: 2, lucky_pass: 2 }
    });
  });

  it("rejects a public case with an unsafe non-root entry path", () => {
    const result = PublicCaseSchema.safeParse({
      schema_version: "prd2play.case.v1",
      id: "bad-path",
      title: "Bad path",
      difficulty: { level: "D1", rationale: "Schema rejection fixture." },
      source: {
        type: "project_authored",
        description: "Unit-test fixture.",
        license: "MIT"
      },
      game: {
        entry_path: "examples/index.html",
        surface: "dom",
        viewport: { width: 800, height: 600 }
      },
      controls: [{ action_id: "START", device: "keyboard", code: "Enter" }],
      requirements: [
        {
          id: "RUN-01",
          layer: "L1",
          severity: "must",
          statement: "The game starts.",
          depends_on: [],
          observable: ["status"]
        }
      ],
      scenarios: [
        {
          id: "start",
          description: "Start once.",
          seed: 1,
          steps: [{ action_id: "START", checkpoints: ["CP-START"] }]
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("fills observation defaults without weakening required evidence channels", () => {
    const observation = ObservationSchema.parse({
      action_index: 0,
      checkpoint_id: "CP-START",
      state: {},
      ui: {},
      event_types: []
    });

    expect(observation.runtime_errors).toEqual([]);
    expect(observation.evidence).toEqual({});
  });
});
