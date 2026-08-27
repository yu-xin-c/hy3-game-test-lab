import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { loadCase, loadOracle } from "../../src/contracts/loaders";
import { evaluateCase } from "../../src/evaluation/evaluator";
import { runPlaythrough } from "../../src/runtime/playthrough";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const baseURL = "http://127.0.0.1:4173";

async function fixture(id: string) {
  return Promise.all([
    loadCase(resolve(repositoryRoot, `datasets/cases/${id}/case.json`)),
    loadOracle(
      resolve(repositoryRoot, `datasets/cases/${id}/oracle.private.json`)
    )
  ]);
}

test("real input completes the clean game and certifies L3", async ({ page }) => {
  const [publicCase, oracle] = await fixture("clean-control");
  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "clean"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);

  expect(result.trace.map((item) => item.action_id)).toEqual([
    "START",
    "MOVE_RIGHT",
    "MOVE_RIGHT"
  ]);
  expect(result.trace.flatMap((item) => item.game_events.map((event) => event.type)))
    .toContain("game_won");
  expect(evaluation).toMatchObject({
    final_outcome_correct: true,
    process_correct: true,
    gates: { L1: "pass", L2: "pass", L3: "pass" },
    highest_certified_level: "L3"
  });
});

test("cross-layer masking cannot certify faulty logic", async ({ page }) => {
  const [publicCase, oracle] = await fixture("cross-layer-masked");
  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "cross_layer_masked"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);

  expect(evaluation.final_outcome_correct).toBe(true);
  expect(evaluation.process_correct).toBe(false);
  expect(evaluation.lucky_pass_detected).toBe(true);
  expect(evaluation.first_failure).toMatchObject({
    checkpoint_id: "CP-COIN-1",
    layer: "L2",
    error_type: "state_effect_error"
  });
  expect(evaluation.gates).toEqual({
    L1: "pass",
    L2: "fail",
    L3: "observed_not_certified"
  });
});
