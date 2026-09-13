import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GameTaskOracleSchema, GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { taskPlanToPublicCase, taskScenarioToPrivateOracle } from "../src/contracts/task-adapter";
import { ObservationSchema } from "../src/contracts/schemas";
import { evaluateCase } from "../src/evaluation/evaluator";

// Re-score recorded observations only. This is an assistant diagnostic, not human validation.
const root = resolve("results/codebuddy-hy3-v4");
const evidence = resolve(root, "evidence/signal-memory");
const raw = await readFile(resolve(evidence, "result.json"));
const result = JSON.parse(raw.toString());
const planBytes = await readFile(resolve(evidence, "task/test-plan.json"));
const oracleBytes = await readFile(resolve(evidence, "task/oracle.private.json"));
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
if (sha(planBytes) !== result.input_hashes.test_plan_sha256 || sha(oracleBytes) !== result.input_hashes.oracle_sha256) throw new Error("Snapshot hash mismatch");
const plan = GameTaskPlanSchema.parse(JSON.parse(planBytes.toString()));
const oracle = GameTaskOracleSchema.parse(JSON.parse(oracleBytes.toString()));
const removed = [];
for (const scenario of oracle.scenarios) {
  for (const checkpoint of scenario.checkpoints) {
    if (!["SM-CP-WON", "SM-CP-LOST", "SM-CP-RESET"].includes(checkpoint.id)) continue;
    removed.push({ checkpoint_id: checkpoint.id, path: "state.phase", expected: checkpoint.expected.state.phase });
    delete checkpoint.expected.state.phase;
  }
}
const publicCase = taskPlanToPublicCase(plan);
const scenarios = result.scenarios.map((entry: { scenario_id: string; replay_index: number; observations: unknown[] }) => ({
  scenario_id: entry.scenario_id,
  replay_index: entry.replay_index,
  evaluation: evaluateCase(publicCase, taskScenarioToPrivateOracle(plan, oracle, entry.scenario_id), entry.observations.map(value => ObservationSchema.parse(value)))
}));
const output = {
  evaluation_context: "retrospective_diagnostic",
  review_kind: "assistant_rule_audit_not_human_review",
  source_result_sha256: sha(raw),
  reason: "The public brief does not specify terminal/menu phase enum names. Remove only those three exact-name assertions; all other assertions and original observations stay unchanged.",
  removed_assertions: removed,
  original_aggregate: result.aggregate,
  diagnostic_aggregate: {
    scenario_runs: scenarios.length,
    process_passes: scenarios.filter((s: { evaluation: ReturnType<typeof evaluateCase> }) => s.evaluation.process_correct).length,
    final_passes: scenarios.filter((s: { evaluation: ReturnType<typeof evaluateCase> }) => s.evaluation.final_outcome_correct).length
  },
  contract_findings: result.contract.findings,
  scenarios
};
await writeFile(resolve(root, "signal-memory-rule-review.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.diagnostic_aggregate));
