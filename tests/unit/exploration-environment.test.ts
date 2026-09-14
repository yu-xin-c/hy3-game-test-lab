import { it, expect } from "vitest";
import { explorationEnvironment } from "../../src/evaluation/exploration-environment";
it("uses the public viewport for new runs and preserves legacy replay settings", () => {
  expect(explorationEnvironment(null).viewport).toEqual({ width: 800, height: 600 });
  expect(explorationEnvironment({}).viewport).toEqual({ width: 1000, height: 800 });
});
it("validates recorded replay conditions", () => {
  const e = explorationEnvironment(null);
  expect(explorationEnvironment({ environment: e })).toEqual(e);
  expect(() => explorationEnvironment({ environment: { ...e, seed: 999 } })).toThrow();
});
