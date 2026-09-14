import { expect, it } from "vitest";
import { errorDistribution } from "../../src/evaluation/error-distribution";
it("counts negative scenarios once and keeps unknown judgments separate", () => {
  const result = errorDistribution([{ id: "one", difficulty: "D2", hy3_review: { scenarios: [
    { scenario_id: "a", process_correct: false, error_type: "ui" },
    { scenario_id: "b", process_correct: false, error_type: "ui" },
    { scenario_id: "c", process_correct: null },
    { scenario_id: "d", process_correct: true }
  ] } }]);
  expect(result.negative_process_scenarios).toBe(2); expect(result.unknown_process_scenarios).toBe(1);
  expect(result.labels[0]).toMatchObject({ count: 2, task_ids: ["one"], fraction_of_negative: 1 });
});
it("rejects duplicate scenarios instead of inflating the denominator", () => {
  expect(() => errorDistribution([{ id: "one", difficulty: "D1", hy3_review: { scenarios: [{ scenario_id: "a", process_correct: false }, { scenario_id: "a", process_correct: true }] } }])).toThrow("Duplicate");
});
