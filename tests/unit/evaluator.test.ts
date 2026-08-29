import { describe, expect, it } from "vitest";
import {
  ObservationSchema,
  PrivateOracleSchema,
  PublicCaseSchema,
  type Observation
} from "../../src/contracts/schemas";
import { evaluateCase } from "../../src/evaluation/evaluator";

const publicCase = PublicCaseSchema.parse({
  schema_version: "gametestlab.case.v1",
  id: "unit-playthrough",
  title: "Evaluator unit playthrough",
  difficulty: { level: "D3", rationale: "Exercises all three gates." },
  source: {
    type: "project_authored",
    description: "Unit-test fixture.",
    license: "MIT"
  },
  game: {
    entry_path: "/fixture.html",
    surface: "dom",
    viewport: { width: 800, height: 600 }
  },
  controls: [
    { action_id: "START", device: "keyboard", code: "Enter" },
    { action_id: "RIGHT", device: "keyboard", code: "ArrowRight" }
  ],
  requirements: [
    {
      id: "RUN-01",
      layer: "L1",
      severity: "must",
      statement: "The game starts.",
      depends_on: [],
      observable: ["state.status"]
    },
    {
      id: "LOGIC-01",
      layer: "L2",
      severity: "must",
      statement: "Each move increases score by one.",
      depends_on: ["RUN-01"],
      observable: ["state.score"]
    },
    {
      id: "UI-01",
      layer: "L3",
      severity: "must",
      statement: "The HUD displays the expected score.",
      depends_on: ["LOGIC-01"],
      observable: ["ui.scoreText"]
    }
  ],
  scenarios: [
    {
      id: "finish",
      description: "Start and move twice.",
      seed: 7,
      steps: [
        { action_id: "START", checkpoints: ["CP-RUN"] },
        { action_id: "RIGHT", checkpoints: ["CP-MID", "CP-MID-UI"] },
        { action_id: "RIGHT", checkpoints: ["CP-FINAL", "CP-FINAL-UI"] }
      ]
    }
  ]
});

const oracle = PrivateOracleSchema.parse({
  schema_version: "gametestlab.oracle.v1",
  case_id: "unit-playthrough",
  scenario_id: "finish",
  checkpoints: [
    {
      id: "CP-RUN",
      action_index: 0,
      layer: "L1",
      requirement_ids: ["RUN-01"],
      expected: { state: { status: "playing" } }
    },
    {
      id: "CP-MID",
      action_index: 1,
      layer: "L2",
      requirement_ids: ["LOGIC-01"],
      expected: { state: { score: 1 } }
    },
    {
      id: "CP-MID-UI",
      action_index: 1,
      layer: "L3",
      requirement_ids: ["UI-01"],
      expected: { ui: { scoreText: "1" } }
    },
    {
      id: "CP-FINAL",
      action_index: 2,
      layer: "L2",
      requirement_ids: ["LOGIC-01"],
      terminal: true,
      expected: { state: { score: 2, status: "won" } }
    },
    {
      id: "CP-FINAL-UI",
      action_index: 2,
      layer: "L3",
      requirement_ids: ["UI-01"],
      expected: { ui: { scoreText: "2" } }
    }
  ],
  fault_ground_truth: {
    sample_kind: "lucky_pass",
    first_divergence_checkpoint: "CP-MID",
    root_requirement_id: "LOGIC-01",
    root_layer: "L2",
    error_type: "state_effect_error",
    final_outcome_correct: true
  }
});

function observation(
  checkpointId: string,
  actionIndex: number,
  state: Record<string, unknown> = {},
  ui: Record<string, unknown> = {}
): Observation {
  return ObservationSchema.parse({
    action_index: actionIndex,
    checkpoint_id: checkpointId,
    state,
    ui,
    event_types: []
  });
}

function cleanObservations(): Observation[] {
  return [
    observation("CP-RUN", 0, { status: "playing" }),
    observation("CP-MID", 1, { score: 1 }),
    observation("CP-MID-UI", 1, {}, { scoreText: "1" }),
    observation("CP-FINAL", 2, { score: 2, status: "won" }),
    observation("CP-FINAL-UI", 2, {}, { scoreText: "2" })
  ];
}

describe("evaluateCase", () => {
  it("certifies a complete correct trace through L3", () => {
    const result = evaluateCase(publicCase, oracle, cleanObservations());

    expect(result).toMatchObject({
      final_outcome_correct: true,
      process_correct: true,
      lucky_pass_detected: false,
      gates: { L1: "pass", L2: "pass", L3: "pass" },
      highest_certified_level: "L3",
      first_failure: null
    });
  });

  it("detects a correct final answer with a wrong intermediate process", () => {
    const observations = cleanObservations();
    observations[1] = observation("CP-MID", 1, { score: 2 });

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.final_outcome_correct).toBe(true);
    expect(result.process_correct).toBe(false);
    expect(result.lucky_pass_detected).toBe(true);
    expect(result.first_failure).toMatchObject({
      action_index: 1,
      checkpoint_id: "CP-MID",
      layer: "L2",
      requirement_ids: ["LOGIC-01"],
      error_type: "state_effect_error"
    });
    expect(result.gates).toEqual({
      L1: "pass",
      L2: "fail",
      L3: "observed_not_certified"
    });
    expect(result.highest_certified_level).toBe("L1");
  });

  it("blocks higher-level certification after an L1 failure", () => {
    const observations = cleanObservations();
    observations[0] = observation("CP-RUN", 0, { status: "menu" });

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.gates).toEqual({ L1: "fail", L2: "blocked", L3: "blocked" });
    expect(result.highest_certified_level).toBe("none");
    expect(result.first_failure).toMatchObject({
      checkpoint_id: "CP-RUN",
      error_type: "terminal_condition_error"
    });
  });

  it("classifies browser errors as L1 even at a later checkpoint", () => {
    const observations = cleanObservations();
    observations[1] = ObservationSchema.parse({
      ...observations[1],
      runtime_errors: ["pageerror: ReferenceError: gameLoop is not defined"]
    });

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.first_failure).toMatchObject({
      checkpoint_id: "CP-MID",
      layer: "L1",
      error_type: "runtime_error"
    });
    expect(result.gates).toEqual({ L1: "fail", L2: "blocked", L3: "blocked" });
  });
});
