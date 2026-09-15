import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { stageRuleReference } from "../src/evaluation/stage-rule-reference";

const i = process.argv.indexOf("--out");
if (i < 0 || !process.argv[i + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[i + 1]!);
const selected = JSON.parse(await readFile("results/consolidated/summary.json", "utf8"));
const tasks = [], skipped = [];
for (const task of selected.tasks) {
  const source = resolve("results/consolidated", task.source_results, "evidence", task.id, "task");
  const brief = await readFile(resolve(source, "brief.md"), "utf8");
  if (!stageRuleReference(brief)) { skipped.push(task.id); continue; }
  const planText = await readFile(resolve(source, "test-plan.json"), "utf8");
  const oracleText = await readFile(resolve(source, "oracle.private.json"), "utf8");
  const plan = JSON.parse(planText), oracle = JSON.parse(oracleText);
  const comparisons = [], traces = [];
  for (const scenario of plan.scenarios) {
    const reference = stageRuleReference(brief)!;
    const expected = oracle.scenarios.find((s: any) => s.scenario_id === scenario.id);
    if (!expected) throw new Error("Missing scenario oracle");
    const trace = [];
    for (const [action_index, step] of scenario.steps.entries()) {
      if (!["input", "advance_time", "reload"].includes(step.kind)) throw new Error(`Unsupported reference action ${step.kind}`);
      if (step.kind === "reload" && !brief.includes("progress、score、lives 和 last_action 必须从本地存档恢复")) throw new Error("Reload preservation is not public");
      const state = step.kind === "input" ? reference.input(step.action_id) : reference.snapshot();
      trace.push({ action_index, step, state });
      for (const cp of expected.checkpoints.filter((c: any) => c.action_index === action_index)) {
        for (const [path, value] of Object.entries(cp.expected.state)) {
          const known = Object.hasOwn(state, path);
          comparisons.push({ scenario_id: scenario.id, checkpoint: cp.id, action_index, path, expected: value,
            reference: known ? state[path] : null,
            verdict: !known ? "outside_reference_scope" : JSON.stringify(value) === JSON.stringify(state[path]) ? "matched" : "mismatch" });
        }
      }
    }
    traces.push({ scenario_id: scenario.id, trace });
  }
  tasks.push({ task_id: task.id, brief_sha256: contentHash(brief), plan_sha256: contentHash(planText), oracle_sha256: contentHash(oracleText), comparisons, traces });
}
await mkdir(out, { recursive: false });
const all = tasks.flatMap(t => t.comparisons);
const counts = all.reduce((a: Record<string, number>, c) => ({ ...a, [c.verdict]: (a[c.verdict] ?? 0) + 1 }), {});
await writeFile(resolve(out, "result.json"), JSON.stringify({
  scope: "Independent reference for four explicit stage-rule fields only. No generated game execution, UI, events, multiplayer transport or persistence implementation certification.",
  reference_sha256: contentHash(await readFile("src/evaluation/stage-rule-reference.ts", "utf8")),
  matched_tasks: tasks.length, skipped_tasks: skipped, counts, tasks
}, null, 2));
console.log(JSON.stringify({ tasks: tasks.length, skipped: skipped.length, counts }));
