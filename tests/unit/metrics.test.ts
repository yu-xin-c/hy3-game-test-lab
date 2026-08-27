import { describe, expect, it } from "vitest";
import {
  CaseEvaluationSchema,
  PrivateOracleSchema,
  type CaseEvaluation,
  type Difficulty,
  type PrivateOracle
} from "../../src/contracts/schemas";
import {
  computeMetrics,
  type EvaluatedSample
} from "../../src/evaluation/metrics";

type SampleKind = PrivateOracle["fault_ground_truth"]["sample_kind"];
type ErrorType = PrivateOracle["fault_ground_truth"]["error_type"];

function makeOracle(
  id: string,
  sampleKind: SampleKind,
  errorType: ErrorType,
  checkpointId: string | null
): PrivateOracle {
  return PrivateOracleSchema.parse({
    schema_version: "prd2play.oracle.v1",
    case_id: id,
    scenario_id: "scenario",
    checkpoints: [
      {
        id: checkpointId ?? "CP-CLEAN",
        action_index: 1,
        layer: errorType === "state_ui_inconsistency" ? "L3" : "L2",
        requirement_ids: ["REQ-01"],
        terminal: true,
        expected: { state: {} }
      }
    ],
    fault_ground_truth: {
      sample_kind: sampleKind,
      first_divergence_checkpoint: checkpointId,
      root_requirement_id: checkpointId ? "REQ-01" : null,
      root_layer: checkpointId
        ? errorType === "state_ui_inconsistency"
          ? "L3"
          : "L2"
        : null,
      error_type: errorType,
      final_outcome_correct: sampleKind !== "faulty" || id === "hud"
    }
  });
}

function makeEvaluation(
  id: string,
  difficulty: Difficulty,
  finalCorrect: boolean,
  processCorrect: boolean,
  checkpointId: string | null,
  errorType: ErrorType
): CaseEvaluation {
  const layer = errorType === "state_ui_inconsistency" ? "L3" : "L2";
  const failure = checkpointId
    ? {
        action_index: 1,
        checkpoint_id: checkpointId,
        layer,
        requirement_ids: ["REQ-01"],
        error_type: errorType,
        diffs: [
          {
            channel: layer === "L3" ? "ui" : "state",
            path: layer === "L3" ? "scoreText" : "score",
            expected: 1,
            actual: 2
          }
        ]
      }
    : null;

  return CaseEvaluationSchema.parse({
    schema_version: "prd2play.evaluation.v1",
    case_id: id,
    difficulty,
    final_outcome_correct: finalCorrect,
    process_correct: processCorrect,
    lucky_pass_detected: finalCorrect && !processCorrect,
    gates: processCorrect
      ? { L1: "pass", L2: "pass", L3: "pass" }
      : { L1: "pass", L2: layer === "L2" ? "fail" : "pass", L3: "fail" },
    highest_certified_level: processCorrect ? "L3" : "L1",
    first_failure: failure,
    all_failures: failure ? [failure] : []
  });
}

function sample(
  id: string,
  difficulty: Difficulty,
  sampleKind: SampleKind,
  finalCorrect: boolean,
  processCorrect: boolean,
  checkpointId: string | null,
  errorType: ErrorType
): EvaluatedSample {
  return {
    oracle: makeOracle(id, sampleKind, errorType, checkpointId),
    evaluation: makeEvaluation(
      id,
      difficulty,
      finalCorrect,
      processCorrect,
      checkpointId,
      errorType
    )
  };
}

describe("computeMetrics", () => {
  it("reports outcome, process, localization, FPR, lucky-pass, error and difficulty metrics", () => {
    const metrics = computeMetrics([
      sample("clean", "D1", "clean", true, true, null, "none"),
      sample(
        "wrong-final",
        "D1",
        "faulty",
        false,
        false,
        "CP-SCORE",
        "state_effect_error"
      ),
      sample(
        "lucky",
        "D2",
        "lucky_pass",
        true,
        false,
        "CP-SCORE",
        "state_effect_error"
      ),
      sample(
        "hud",
        "D3",
        "faulty",
        true,
        false,
        "CP-HUD",
        "state_ui_inconsistency"
      )
    ]);

    expect(metrics).toMatchObject({
      sample_count: 4,
      final_answer_accuracy: 0.75,
      process_correctness: 0.25,
      localization_exact_accuracy: 1,
      localization_within_one_accuracy: 1,
      false_positive_rate: 0,
      lucky_pass_recall: 1,
      error_type_macro_f1: 1,
      error_type_distribution: {
        none: 1,
        state_effect_error: 2,
        state_ui_inconsistency: 1
      },
      by_difficulty: {
        D1: { count: 2, final_accuracy: 0.5, process_correctness: 0.5 },
        D2: { count: 1, final_accuracy: 1, process_correctness: 0 },
        D3: { count: 1, final_accuracy: 1, process_correctness: 0 }
      }
    });
  });

  it("uses zero for metrics whose denominator is empty", () => {
    const metrics = computeMetrics([]);

    expect(metrics.sample_count).toBe(0);
    expect(metrics.final_answer_accuracy).toBe(0);
    expect(metrics.false_positive_rate).toBe(0);
    expect(metrics.lucky_pass_recall).toBe(0);
    expect(metrics.error_type_macro_f1).toBe(0);
  });
});
