import { expect, it } from "vitest";
import { verifierMetrics } from "../../src/evaluation/verifier-metrics";
it("counts late localization as a miss even when a defect is detected", () => {
  const m = verifierMetrics([
    { gold: { defect: true, first_error_index: 1 }, review: { verdict: { defect: true, first_error_index: 3 } } },
    { gold: { defect: true, first_error_index: 3 }, review: { verdict: { defect: true, first_error_index: 3 } } },
    { gold: { defect: false, first_error_index: null }, review: { verdict: { defect: false, first_error_index: null } } }
  ]);
  expect(m.detection.rate).toBe(1); expect(m.observed_step_localization.rate).toBe(.5); expect(m.false_positive_rate.rate).toBe(0);
});
it("does not publish partial-batch rates", () => {
  expect(verifierMetrics([{ gold: { defect: true, first_error_index: 1 }, review: null }]).detection.rate).toBeNull();
});
it("does not invent a rate for an absent negative or positive class", () => {
  const m = verifierMetrics([{ gold: { defect: false, first_error_index: null }, review: { verdict: { defect: true, first_error_index: 0 } } }]);
  expect(m.detection.rate).toBeNull(); expect(m.false_positive_rate.rate).toBe(1);
});
