import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GameTaskOracleSchema, GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { PrivateOracleSchema } from "../src/contracts/schemas";
import { taskPlanToPublicCase, taskScenarioToPrivateOracle } from "../src/contracts/task-adapter";
import { evaluateCase } from "../src/evaluation/evaluator";
import { contentHash } from "../src/evaluation/generation-provenance";
import { validateAuditReview } from "../src/evaluation/oracle-audit";

const root = resolve(process.argv[2] ?? "results/process-15-v1");
const audit = resolve("results/public-check-audit-v1");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const scope = await json(resolve(root, "scope.json"));
const auditScope = await json(resolve(audit, "scope.json"));
if (scope.schema_version !== "hy3-process-15-scope.v1" || scope.selected_ids.length !== 15 || auditScope.task_limit !== 15) throw new Error("Formal scopes must both be 15");
const inventoryText = await readFile(resolve(audit, "inventory.json"), "utf8");
if ((await readFile(resolve(audit, "inventory.sha256"), "utf8")).trim() !== contentHash(inventoryText) + "  inventory.json") throw new Error("Inventory hash mismatch");
const inventory = JSON.parse(inventoryText).slice(0, 15);
if (JSON.stringify(inventory.map((p: any) => p.task_id)) !== JSON.stringify(scope.selected_ids)) throw new Error("Task order mismatch");
const reused = new Map(scope.reused_completed_games.map((item: any) => [item.id, item.source]));
const explicitSourceRisks = new Map([
  ["target-rush/A31", "next target does not entail terminal target_index=5"],
  ["dual-arena/A42", "reset connection does not entail a numeric connected=0"]
]);
const explicitContextRisks = new Map([
  ["room-five-in-row/A53/win-path/FR-CP-START", "creating a room does not require playing before the second page joins"],
  ["room-five-in-row/A53/loss-path/room-five-in-row-loss-path-started", "creating a room does not require playing before the second page joins"],
  ["room-five-in-row/A53/restart-path/room-five-in-row-restart-path-started", "creating a room does not require playing before the second page joins"]
]);
const pathProblems = new Set(["neon-lane-racer/win-path", "neon-lane-racer/loss-path", "meteor-survivor/win-path", "meteor-survivor/loss-path"]);
const rows: any[] = [], pending: string[] = [];
for (const packet of inventory) {
  const id = packet.task_id, dir = resolve(reused.get(id) as string ?? resolve(root, id));
  let status: any;
  try { status = await json(resolve(dir, "status.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { pending.push(id); continue; } throw error; }
  if (status.stage !== "complete") { pending.push(id); continue; }
  const saved = await json(resolve(audit, id, "review.json"));
  if (saved.model !== "hy3") throw new Error(`Source audit is not Hy3: ${id}`);
  const prompt = await readFile(resolve(audit, id, "prompt.txt"), "utf8"), receipt = await json(resolve(audit, id, "receipt.json"));
  if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(prompt)) throw new Error(`Invalid source audit receipt: ${id}`);
  const decisions = validateAuditReview(saved.review, packet.assertions, packet.publicText).assertions;
  const originalPlan = GameTaskPlanSchema.parse(await json(resolve(dir, "task/test-plan.json")));
  const originalOracle = GameTaskOracleSchema.parse(await json(resolve(dir, "task/oracle.private.json")));
  const browser = await json(resolve(dir, "browser/result.json"));
  const plan = taskPlanToPublicCase(originalPlan);
  const scenarioOracles = new Map(originalPlan.scenarios.map(s => [s.id, taskScenarioToPrivateOracle(originalPlan, originalOracle, s.id)]));
  const copied = new Map([...scenarioOracles].map(([scenarioId, oracle]) => [scenarioId, structuredClone(oracle)]));
  const removed: any[] = [], unhandled: any[] = [];
  for (const assertion of packet.assertions) {
    const decision = decisions.find((d: any) => d.id === assertion.id);
    if (!decision) throw new Error(`Missing decision: ${id}/${assertion.id}`);
    const generalRisk = decision?.verdict === "unsupported" || decision?.verdict === "ambiguous" ||
      (assertion.kind === "ui_text" && assertion.path === "statusText" && assertion.expected?.mode === "equals") ||
      explicitSourceRisks.has(`${id}/${assertion.id}`);
    if (!generalRisk && !assertion.contexts.some((context: string) => explicitContextRisks.has(`${id}/${assertion.id}/${context}`))) continue;
    for (const context of assertion.contexts) {
      const contextWhy = explicitContextRisks.get(`${id}/${assertion.id}/${context}`);
      if (!generalRisk && !contextWhy) continue;
      const why = contextWhy ?? explicitSourceRisks.get(`${id}/${assertion.id}`) ??
        (assertion.kind === "ui_text" && assertion.path === "statusText" ? "entire HUD node exclusivity not established" : `Hy3 source label: ${decision.verdict}`);
      const slash = context.indexOf("/");
      if (slash < 0) { unhandled.push({ assertion_id: assertion.id, context, kind: assertion.kind, path: assertion.path, why }); continue; }
      const scenarioId = context.slice(0, slash), checkpointId = context.slice(slash + 1);
      const oracle = copied.get(scenarioId);
      const checkpoint = oracle?.checkpoints.find(c => c.id === checkpointId);
      if (!checkpoint) throw new Error(`Missing private checkpoint for ${id}/${assertion.id}/${context}`);
      let applied = false;
      if (assertion.kind === "state" && Object.hasOwn(checkpoint.expected.state, assertion.path)) {
        if (JSON.stringify(checkpoint.expected.state[assertion.path]) !== JSON.stringify(assertion.expected)) throw new Error(`Value mismatch for ${id}/${assertion.id}`);
        delete checkpoint.expected.state[assertion.path]; applied = true;
      } else if (assertion.kind === "event_types" && checkpoint.expected.event_types.includes(assertion.expected)) {
        checkpoint.expected.event_types = checkpoint.expected.event_types.filter(type => type !== assertion.expected); applied = true;
      } else if (assertion.kind === "ui_text" && Object.hasOwn(checkpoint.expected.ui_text ?? {}, assertion.path)) {
        if (JSON.stringify(checkpoint.expected.ui_text![assertion.path]) !== JSON.stringify(assertion.expected)) throw new Error(`UI text mismatch for ${id}/${assertion.id}`);
        delete checkpoint.expected.ui_text![assertion.path]; applied = true;
      } else if (assertion.kind === "ui" && Object.hasOwn(checkpoint.expected.ui, assertion.path)) {
        if (JSON.stringify(checkpoint.expected.ui[assertion.path]) !== JSON.stringify(assertion.expected)) throw new Error(`UI value mismatch for ${id}/${assertion.id}`);
        delete checkpoint.expected.ui[assertion.path]; applied = true;
      }
      (applied ? removed : unhandled).push({ assertion_id: assertion.id, context, kind: assertion.kind, path: assertion.path, why });
    }
  }
  const paths = browser.scenarios.filter((s: any) => s.replay_index === 0).map((scenario: any) => {
    const oracle = PrivateOracleSchema.parse(copied.get(scenario.scenario_id));
    const rescored = evaluateCase(plan, oracle, scenario.observations);
    return { scenario_id: scenario.scenario_id, original_final: scenario.evaluation.final_outcome_correct,
      original_process: scenario.evaluation.process_correct, gated_final: rescored.final_outcome_correct,
      gated_process: rescored.process_correct, gated_first_failure: rescored.first_failure,
      path_problem: pathProblems.has(`${id}/${scenario.scenario_id}`) };
  });
  rows.push({ id, excluded_context_checks: removed.length, unhandled_risk_contexts: unhandled.length, removed, unhandled, paths });
}
const counts = { completed_games: rows.length, pending_games: pending.length,
  excluded_context_checks: rows.reduce((n, r) => n + r.excluded_context_checks, 0),
  unhandled_risk_contexts: rows.reduce((n, r) => n + r.unhandled_risk_contexts, 0),
  original_process_paths: rows.flatMap(r => r.paths).filter(p => p.original_process).length,
  gated_process_paths: rows.flatMap(r => r.paths).filter(p => p.gated_process).length,
  total_paths: rows.flatMap(r => r.paths).length,
  invalid_fixed_paths: rows.flatMap(r => r.paths).filter(p => p.path_problem).length };
const result = { scope: "Sensitivity analysis: source-gated oracle copy; model labels are not independent standard truth, and invalid fixed paths remain flagged",
  inventory_sha256: contentHash(inventoryText), counts, pending, rows };
await writeFile(resolve(root, "source-gated-rescore.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "SOURCE-GATED-RESCORE.md"), ["# 标准风险隔离后的重算对照", "",
  `已完成 ${counts.completed_games}/15 题；从检查副本隔离 ${counts.excluded_context_checks} 处缺依据/歧义或已知标准风险，另有 ${counts.unhandled_risk_contexts} 处风险未能映射到状态、事件或界面期待。`, "",
  `原路径过程通过 ${counts.original_process_paths}/${counts.total_paths}，隔离后的副本 ${counts.gated_process_paths}/${counts.total_paths}；${counts.invalid_fixed_paths} 条固定路径自身与公开规则冲突，不能把隔离后失败直接算游戏缺陷。`, "",
  "这只是标准敏感性分析：混元引文标签也可能错，支持标签不等于独立真值；原浏览器结果、私有答案和冻结输入均未覆盖。赛车与流星的追加公开规则路径见各自 README。", "",
  "| 题目 | 隔离处数 | 原始过程通过 | 隔离后过程通过 | 固定路径问题 |", "| --- | ---: | ---: | ---: | ---: |",
  ...rows.map(r => `| ${r.id} | ${r.excluded_context_checks} | ${r.paths.filter((p: any) => p.original_process).length}/${r.paths.length} | ${r.paths.filter((p: any) => p.gated_process).length}/${r.paths.length} | ${r.paths.filter((p: any) => p.path_problem).length} |`), ""
].join("\n"));
console.log(JSON.stringify(counts));
