import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDatasetEntry, loadManifest } from "../../src/contracts/loaders";
import {
  CheckpointExpectationSchema,
  ControlSchema,
  DatasetManifestEntrySchema,
  ErrorTypeSchema,
  FailureSchema,
  ObservationSchema,
  PhysicsInvariantSchema,
  PrivateOracleSchema,
  PublicCaseSchema,
  ScenarioSchema,
  ScenarioStepSchema,
  TimelineSampleSchema
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

    const first = entries[0];
    if (!first) throw new Error("expected a dataset entry");
    expect(PublicCaseSchema.safeParse({
      ...first.publicCase,
      schema_version: "gametestlab.case.v1",
      scenarios: [{
        ...first.publicCase.scenarios[0],
        clock: { mode: "virtual" },
        steps: [{ kind: "advance_time", advance_ms: 10, checkpoints: ["CP-READY"] }]
      }]
    }).success).toBe(false);
    expect(PrivateOracleSchema.safeParse({
      ...first.oracle,
      schema_version: "gametestlab.oracle.v1",
      checkpoints: first.oracle.checkpoints.map((checkpoint, index) =>
        index === 0
          ? {
              ...checkpoint,
              expected: {
                ...checkpoint.expected,
                physics: [{ id: "P-V2", type: "no_penetration" }]
              }
            }
          : checkpoint
      )
    }).success).toBe(false);
  });

  it("rejects a public case with an unsafe non-root entry path", () => {
    const result = PublicCaseSchema.safeParse({
      schema_version: "gametestlab.case.v1",
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

  it.each([
    ["../../escape", "/examples/index.html"],
    ["/tmp/escape", "/examples/index.html"],
    ["safe-id", "//evil.example/game"],
    ["safe-id", "/\\evil.example/game"],
    ["safe-id", "/examples/../secret.html"]
  ])("rejects unsafe case id or game path", (id, entryPath) => {
    const result = PublicCaseSchema.safeParse({
      schema_version: "gametestlab.case.v2",
      id,
      title: "Unsafe path",
      difficulty: { level: "D1", rationale: "Security fixture." },
      source: {
        type: "project_authored",
        description: "Unit-test fixture.",
        license: "MIT"
      },
      game: {
        entry_path: entryPath,
        surface: "dom",
        viewport: { width: 800, height: 600 }
      },
      controls: [{ action_id: "START", device: "keyboard", code: "Enter" }],
      requirements: [{
        id: "RUN-01",
        layer: "L1",
        severity: "must",
        statement: "The game starts.",
        observable: ["status"]
      }],
      scenarios: [{
        id: "start",
        description: "Start once.",
        seed: 1,
        steps: [{ action_id: "START", checkpoints: ["CP-START"] }]
      }]
    });

    expect(result.success).toBe(false);
  });

  it.each(["../case.json", "/tmp/case.json", "datasets\\case.json"])(
    "rejects unsafe dataset file path %s",
    (filePath) => {
      expect(DatasetManifestEntrySchema.safeParse({
        case_file: filePath,
        oracle_file: "datasets/oracle.json",
        fixture_variant: "clean"
      }).success).toBe(false);
    }
  );

  it("fills observation defaults without weakening required evidence channels", () => {
    const observation = ObservationSchema.parse({
      action_index: 0,
      checkpoint_id: "CP-START",
      state: {},
      ui: {},
      event_types: []
    });

    expect(observation.runtime_errors).toEqual([]);
    expect(observation.runtime_error_evidence).toEqual([]);
    expect(observation.samples).toEqual([]);
    expect(observation.evidence).toEqual({});
  });

  it("keeps old controls and input-only scenarios compatible through defaults", () => {
    const control = ControlSchema.parse({
      action_id: "JUMP",
      device: "keyboard",
      code: "Space"
    });
    const scenario = ScenarioSchema.parse({
      id: "old-input-path",
      description: "An existing case without step kinds or a clock.",
      seed: 7,
      steps: [{ action_id: "JUMP", checkpoints: ["CP-JUMP"] }]
    });

    expect(control.key_event).toBe("press");
    expect(scenario.clock).toEqual({
      mode: "real",
      start_time_ms: 0,
      setup_ms: 0
    });
    expect(scenario.steps[0]).toEqual({
      kind: "input",
      action_id: "JUMP",
      advance_ms: 0,
      checkpoints: ["CP-JUMP"]
    });
  });

  it("parses key lifecycle controls and virtual clock configuration", () => {
    expect(ControlSchema.parse({
      action_id: "MOVE_RIGHT_DOWN",
      device: "keyboard",
      key_event: "down",
      code: "ArrowRight"
    }).key_event).toBe("down");
    expect(ControlSchema.parse({
      action_id: "MOVE_RIGHT_UP",
      device: "keyboard",
      key_event: "up",
      code: "ArrowRight"
    }).key_event).toBe("up");

    const scenario = ScenarioSchema.parse({
      id: "virtual-time",
      description: "A clock-controlled jump.",
      seed: 9,
      clock: { mode: "virtual" },
      steps: [{ kind: "advance_time", advance_ms: 250 }]
    });
    expect(scenario.clock).toEqual({
      mode: "virtual",
      start_time_ms: 0,
      setup_ms: 0
    });
  });

  it("maps pointer selectors without accepting ignored key lifecycle fields", () => {
    expect(ControlSchema.parse({
      action_id: "START",
      device: "mouse",
      selector: "#start"
    })).toMatchObject({ selector: "#start", key_event: "press" });
    expect(ControlSchema.safeParse({
      action_id: "BAD_POINTER_HOLD",
      device: "mouse",
      selector: "#start",
      key_event: "down"
    }).success).toBe(false);
  });

  it("parses explicit time and frame steps with stable defaults", () => {
    expect(ScenarioStepSchema.parse({
      kind: "advance_time",
      advance_ms: 20,
      checkpoints: ["CP-TIMER"]
    })).toEqual({
      kind: "advance_time",
      advance_ms: 20,
      checkpoints: ["CP-TIMER"]
    });

    expect(ScenarioStepSchema.parse({
      kind: "advance_frames",
      frames: 60
    })).toEqual({
      kind: "advance_frames",
      frames: 60,
      frame_ms: 1000 / 60,
      sample_every: 1,
      checkpoints: []
    });
  });

  it("requires virtual time for reproducible frame advancement", () => {
    const result = ScenarioSchema.safeParse({
      id: "unstable-real-frames",
      description: "Frame stepping cannot use wall-clock waits.",
      seed: 1,
      steps: [{ kind: "advance_frames", frames: 10 }]
    });

    expect(result.success).toBe(false);
    expect(ScenarioSchema.safeParse({
      id: "unstable-real-time",
      description: "Wall-clock time is not a reproducible probe.",
      seed: 1,
      steps: [{ kind: "advance_time", advance_ms: 10 }]
    }).success).toBe(false);
  });

  it.each([
    { kind: "advance_time", advance_ms: 0 },
    { kind: "advance_time", advance_ms: 10, action_id: "JUMP" },
    { kind: "advance_frames", frames: 0 },
    { kind: "advance_frames", frames: 3, frame_ms: 0 },
    { kind: "advance_frames", frames: 3, sample_every: 4 },
    { kind: "advance_frames", frames: 3, action_id: "JUMP" },
    { kind: "input", advance_ms: 10 },
    { action_id: "JUMP", frames: 2 }
  ])("rejects an invalid scenario-step combination: %o", (step) => {
    expect(ScenarioStepSchema.safeParse(step).success).toBe(false);
  });

  it("parses strict physics invariant variants and their defaults", () => {
    const invariants = [
      { id: "PHYS-1", type: "no_penetration" },
      { id: "PHYS-2", type: "no_tunneling", platform_id: "ledge" },
      { id: "PHYS-3", type: "grounded_has_support" },
      { id: "PHYS-4", type: "jump_apex_reaches", platform_id: "ledge" },
      {
        id: "PHYS-5",
        type: "eventually_supported",
        platform_id: "ledge"
      },
      {
        id: "PHYS-6",
        type: "world_bounds",
        bounds_path: "world.bounds"
      }
    ].map((invariant) => PhysicsInvariantSchema.parse(invariant));

    for (const invariant of invariants) {
      expect(invariant.player_path).toBe("player");
      expect(invariant.platforms_path).toBe("platforms");
      expect(invariant.epsilon).toBe(0.5);
    }
    expect(invariants[4]).toMatchObject({ min_consecutive_samples: 2 });
  });

  it.each([
    { id: "PHYS-X", type: "jump_apex_reaches" },
    { id: "PHYS-X", type: "eventually_supported", platform_id: "ledge", min_consecutive_samples: 0 },
    { id: "PHYS-X", type: "world_bounds" },
    { id: "PHYS-X", type: "no_penetration", bounds_path: "world.bounds" },
    { id: "PHYS-X", type: "unknown_physics" }
  ])("rejects an invalid strict physics invariant: %o", (invariant) => {
    expect(PhysicsInvariantSchema.safeParse(invariant).success).toBe(false);
  });

  it("requires a real checkpoint assertion and rejects misspelled channels", () => {
    const base = {
      id: "CP-JUMP",
      action_index: 1,
      layer: "L2" as const,
      requirement_ids: ["LOGIC-01"],
      expected: { state: { status: "playing" } }
    };
    expect(CheckpointExpectationSchema.parse(base).expected.physics).toEqual([]);
    expect(CheckpointExpectationSchema.safeParse({
      ...base,
      expected: {}
    }).success).toBe(false);
    expect(CheckpointExpectationSchema.safeParse({
      ...base,
      expected: { physic: [{ id: "TYPO", type: "no_penetration" }] }
    }).success).toBe(false);

    const parsed = CheckpointExpectationSchema.parse({
      ...base,
      expected: {
        physics: [{
          id: "PHYS-JUMP",
          type: "eventually_supported",
          platform_id: "ledge",
          min_consecutive_samples: 3
        }]
      }
    });
    expect(parsed.expected.physics[0]).toMatchObject({
      type: "eventually_supported",
      min_consecutive_samples: 3
    });
    expect(CheckpointExpectationSchema.safeParse({
      ...base,
      terminal: true,
      expected: { physics: [{ id: "ONLY-PHYS", type: "no_penetration" }] }
    }).success).toBe(false);
  });

  it("validates timeline samples and physics failure locations", () => {
    const sample = TimelineSampleSchema.parse({
      sample_index: 12,
      frame_index: 13,
      elapsed_ms: 200,
      tick: 12,
      status: "playing",
      state: { player: { x: 10, y: 20 } },
      event_types: ["jump_apex"]
    });
    expect(sample.sample_index).toBe(12);

    const failure = FailureSchema.parse({
      action_index: 1,
      sample_index: 12,
      frame_index: 13,
      tick: 12,
      elapsed_ms: 200,
      checkpoint_id: "CP-JUMP",
      layer: "L2",
      requirement_ids: ["LOGIC-01"],
      error_type: "physics_penetration",
      diffs: [{
        channel: "physics",
        path: "player",
        expected: "outside platforms",
        actual: { overlap_x: 8, overlap_y: 4 }
      }]
    });
    expect(failure.sample_index).toBe(12);
    expect(failure.frame_index).toBe(13);
    expect(failure.tick).toBe(12);
    expect(ErrorTypeSchema.safeParse("physics_world_bounds").success).toBe(true);
    expect(TimelineSampleSchema.safeParse({ ...sample, tick: -1 }).success).toBe(false);
  });
});
