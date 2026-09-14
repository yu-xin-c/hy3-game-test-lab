import { expect, it } from "vitest";
import { compactReviewEvidence } from "../../src/evaluation/review-evidence";

it("retains every replay verdict while omitting duplicated observations", () => {
  const result = { task_id: "jump", scenarios: [0, 1, 2].map(i => ({
    scenario_id: "win", replay_index: i,
    evaluation: { final_outcome_correct: i !== 1, first_failure: i === 1 ? { tick: 42 } : null },
    observations: [{ huge: "frame payload" }], browser: { duplicated: true }
  })) };
  const compact = compactReviewEvidence(result);
  expect(compact.scenarios).toHaveLength(3);
  expect(compact.scenarios[1].evaluation.first_failure.tick).toBe(42);
  expect(compact.scenarios[0]).not.toHaveProperty("observations");
  expect(result.scenarios[0]!.observations).toHaveLength(1);
});
