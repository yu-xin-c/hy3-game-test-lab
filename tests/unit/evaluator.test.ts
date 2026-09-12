import { describe, expect, it } from "vitest";
import {
  CaseEvaluationSchema,
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
  it("normalizes only explicitly declared UI text rules", () => {
    const revised = structuredClone(oracle);
    revised.checkpoints[4]!.expected.ui = {};
    revised.checkpoints[4]!.expected.ui_text = { statusText: { mode: "equals", value: "Won", ignore_case: true } };
    const rows = cleanObservations();
    rows[4] = observation("CP-FINAL-UI", 2, {}, { statusText: "  WON\n" });
    expect(evaluateCase(publicCase, revised, rows).process_correct).toBe(true);
    rows[4] = observation("CP-FINAL-UI", 2, {}, { statusText: "Lost" });
    expect(evaluateCase(publicCase, revised, rows).process_correct).toBe(false);
    expect(evaluateCase(publicCase, oracle, rows).process_correct).toBe(false);
  });

  it("accepts numeric error only within an explicit tolerance", () => {
    const revised = structuredClone(oracle);
    revised.checkpoints[3]!.expected.state_tolerances = { score: 0.2 };
    const rows = cleanObservations();
    rows[3] = observation("CP-FINAL", 2, { score: 2.1, status: "won" });
    expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(true);
    expect(evaluateCase(publicCase, oracle, rows).final_outcome_correct).toBe(false);
    rows[3] = observation("CP-FINAL", 2, { score: 2.2, status: "won" });
    expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(true);
    for (const score of [2.3, "2", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      rows[3] = observation("CP-FINAL", 2, { score, status: "won" });
      expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(false);
    }
    revised.checkpoints[3]!.expected.state_tolerances = { nonexistent: 1 };
    expect(PrivateOracleSchema.safeParse(revised).success).toBe(false);
  });

  it("uses interval events only when requested, never guesses missing evidence", () => {
    const revised = structuredClone(oracle);
    revised.checkpoints[3]!.expected.event_types = ["scored"];
    const rows = cleanObservations();
    rows[3]!.event_types_since_checkpoint = ["scored"];
    expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(false);
    revised.checkpoints[3]!.expected.event_scope = "since_previous_checkpoint";
    expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(true);
    delete rows[3]!.event_types_since_checkpoint;
    expect(evaluateCase(publicCase, revised, rows).final_outcome_correct).toBe(false);
  });

  it("does not count a blank or absent HUD as visible content", () => {
    const revised = structuredClone(oracle);
    revised.checkpoints[4]!.expected.ui = {};
    revised.checkpoints[4]!.expected.ui_text = { scoreText: { mode: "nonempty" } };
    for (const text of ["  \n", undefined, 0]) {
      const rows = cleanObservations();
      rows[4] = observation("CP-FINAL-UI", 2, {}, { scoreText: text });
      expect(evaluateCase(publicCase, revised, rows).gates.L3).toBe("fail");
    }
  });

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

  it("keeps a correct terminal outcome separate from a physics process failure", () => {
    const physicsOracle = PrivateOracleSchema.parse({
      ...oracle,
      schema_version: "gametestlab.oracle.v2",
      checkpoints: oracle.checkpoints.map((checkpoint) =>
        checkpoint.id === "CP-FINAL"
          ? {
              ...checkpoint,
              expected: {
                ...checkpoint.expected,
                physics: [{
                  id: "PHYS-PEN",
                  type: "no_penetration",
                  platform_id: "ledge"
                }]
              }
            }
          : checkpoint
      )
    });
    const observations = cleanObservations();
    observations[3] = ObservationSchema.parse({
      ...observations[3],
      state: {
        score: 2,
        status: "won",
        player: { x: 10, y: 90, width: 20, height: 20 },
        platforms: [{ id: "ledge", x: 0, y: 100, width: 100, height: 20 }]
      },
      samples: [{
        sample_index: 7,
        elapsed_ms: 116.7,
        tick: 7,
        status: "won",
        state: {
          player: { x: 10, y: 90, width: 20, height: 20 },
          platforms: [{ id: "ledge", x: 0, y: 100, width: 100, height: 20 }]
        },
        event_types: []
      }]
    });

    const result = evaluateCase(publicCase, physicsOracle, observations);

    expect(result).toMatchObject({
      final_outcome_correct: true,
      process_correct: false,
      lucky_pass_detected: true,
      first_failure: {
        checkpoint_id: "CP-FINAL",
        error_type: "physics_penetration",
        sample_index: 7,
        elapsed_ms: 116.7
      }
    });
  });

  it("does not blame game physics when required timeline evidence is absent", () => {
    const physicsOracle = PrivateOracleSchema.parse({
      ...oracle,
      schema_version: "gametestlab.oracle.v2",
      checkpoints: oracle.checkpoints.map((checkpoint) =>
        checkpoint.id === "CP-FINAL"
          ? {
              ...checkpoint,
              expected: {
                ...checkpoint.expected,
                physics: [{ id: "PHYS-PEN", type: "no_penetration" }]
              }
            }
          : checkpoint
      )
    });

    const result = evaluateCase(publicCase, physicsOracle, cleanObservations());

    expect(result).toMatchObject({
      final_outcome_correct: true,
      process_correct: false,
      lucky_pass_detected: true,
      gates: { L1: "fail", L2: "blocked", L3: "blocked" },
      first_failure: {
        checkpoint_id: "CP-FINAL",
        layer: "L1",
        error_type: "artifact_failure"
      }
    });
    expect(result.first_failure?.sample_index).toBeUndefined();
  });

  it("classifies a checkpoint with the wrong action index as bad evidence", () => {
    const observations = cleanObservations();
    observations[1] = observation("CP-MID", 2, { score: 1 });

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.first_failure).toMatchObject({
      checkpoint_id: "CP-MID",
      layer: "L1",
      error_type: "artifact_failure",
      diffs: [{
        channel: "runtime",
        path: "observation.action_index",
        expected: 1,
        actual: 2
      }]
    });
  });

  it("keeps missing values explicit after a JSON round trip", () => {
    const observations = cleanObservations();
    observations[1] = observation("CP-MID", 1, {});

    const result = evaluateCase(publicCase, oracle, observations);
    const stored = JSON.parse(JSON.stringify(result)) as unknown;
    const reparsed = CaseEvaluationSchema.parse(stored);

    expect(reparsed.first_failure?.diffs[0]).toEqual({
      channel: "state",
      path: "score",
      expected: 1,
      actual: { kind: "missing" }
    });
  });

  it("does not certify a terminal observation from the wrong action", () => {
    const observations = cleanObservations();
    observations[3] = observation(
      "CP-FINAL",
      0,
      { score: 2, status: "won" }
    );

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.final_outcome_correct).toBe(false);
    expect(result.first_failure).toMatchObject({
      checkpoint_id: "CP-FINAL",
      layer: "L1",
      error_type: "artifact_failure"
    });
  });

  it("uses structured runtime evidence even without the legacy string list", () => {
    const observations = cleanObservations();
    observations[1] = ObservationSchema.parse({
      ...observations[1],
      runtime_errors: [],
      runtime_error_evidence: [{
        source: "console",
        message: "console: STRUCTURED_ONLY",
        action_index: 1,
        frame_index: null,
        elapsed_ms: 0
      }]
    });

    const result = evaluateCase(publicCase, oracle, observations);

    expect(result.first_failure).toMatchObject({
      action_index: 1,
      layer: "L1",
      error_type: "runtime_error"
    });
  });

  it("fails L1 for runtime evidence even when the oracle has no L1 checkpoint", () => {
    const noL1Oracle = PrivateOracleSchema.parse({
      ...oracle,
      checkpoints: oracle.checkpoints.filter((checkpoint) =>
        checkpoint.layer !== "L1"
      )
    });
    const observations = cleanObservations().filter(
      (item) => item.checkpoint_id !== "CP-RUN"
    );
    observations[0] = ObservationSchema.parse({
      ...observations[0],
      runtime_error_evidence: [{
        source: "pageerror",
        message: "pageerror: setup failed",
        action_index: 1,
        frame_index: null,
        elapsed_ms: 0
      }]
    });

    const result = evaluateCase(publicCase, noL1Oracle, observations);

    expect(result.gates).toEqual({ L1: "fail", L2: "blocked", L3: "blocked" });
  });
});
