import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function readJson(path: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const batchDirectory = resolve(argument("--batch-dir") ?? "");
if (!argument("--batch-dir")) throw new Error("Missing --batch-dir");
const outputDirectory = resolve(argument("--out-dir") ?? batchDirectory);
const requestedTaskIds = new Set(
  (argument("--tasks") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const manifest = await readJson(resolve(batchDirectory, "batch-manifest.json"));
const activeManifest = await readJson(fileURLToPath(new URL("../datasets/game-tasks/manifest.json", import.meta.url)));
const activeIds = new Set(activeManifest.tasks.map((task: Record<string, any>) => String(task.id)));
const tasks = (manifest.tasks as Array<Record<string, any>>).filter(
  (task) => activeIds.has(String(task.id)) &&
    (requestedTaskIds.size === 0 || requestedTaskIds.has(String(task.id)))
);
const taskSummaries: Array<Record<string, any>> = [];

for (const task of tasks) {
  const generationPath = resolve(batchDirectory, "generated", task.id, "generation.json");
  let generation: Record<string, any>;
  try {
    generation = await readJson(generationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  const resultPath = resolve(dirname(generationPath), String(generation.result_file));
  const result = await readJson(resultPath);
  const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
  const scenarioGroups = new Map<string, Array<Record<string, any>>>();
  for (const scenario of scenarios) {
    const id = String(scenario.scenario_id);
    const entries = scenarioGroups.get(id) ?? [];
    entries.push(scenario);
    scenarioGroups.set(id, entries);
  }
  taskSummaries.push({
    id: task.id,
    category: task.category,
    difficulty: task.difficulty,
    features: task.features,
    status: result.status,
    generation: {
      model: generation.model,
      attempt: generation.attempt,
      manual_code_edits: generation.manual_code_edits,
      credits_used: generation.credits_used,
      reported_tokens: generation.reported_tokens,
      reported_duration_seconds: generation.reported_duration_seconds
    },
    aggregate: result.aggregate ?? null,
    contract_findings: result.contract?.findings?.length ?? 0,
    gates: Object.fromEntries(["L1", "L2", "L3"].map((layer) => {
      const counts: Record<string, number> = {};
      for (const scenario of scenarios) {
        const status = scenario.evaluation?.gates?.[layer] ?? "unverified";
        counts[status] = (counts[status] ?? 0) + 1;
      }
      return [layer, counts];
    })),
    input_hashes: result.input_hashes,
    source_result: generation.result_file,
    scenarios: [...scenarioGroups].map(([id, entries]) => {
      const evaluations = entries.map((entry) => entry.evaluation ?? {});
      const stateHashes = entries.map((entry) => createHash("sha256")
        .update(canonical((entry.observations ?? []).map((observation: Record<string, any>) => ({
          action_index: observation.action_index,
          checkpoint_id: observation.checkpoint_id,
          state: observation.state,
          event_types: observation.event_types
        }))))
        .digest("hex"));
      return {
        id,
        replays: entries.length,
        process_passes: evaluations.filter((entry) => entry.process_correct === true).length,
        final_passes: evaluations.filter((entry) => entry.final_outcome_correct === true).length,
        lucky_passes: evaluations.filter((entry) => entry.lucky_pass_detected === true).length,
        stable_process: new Set(evaluations.map((entry) => entry.process_correct)).size <= 1,
        stable_final: new Set(evaluations.map((entry) => entry.final_outcome_correct)).size <= 1,
        checkpoint_state_hashes: stateHashes,
        stable_checkpoint_states: new Set(stateHashes).size === 1 && entries.length > 1,
        first_failures: [...new Set(evaluations
          .map((entry) => entry.first_failure?.error_type)
          .filter(Boolean))]
      };
    })
  });
}

const totals = taskSummaries.reduce((sum, task) => {
  const aggregate = task.aggregate ?? {};
  sum.scenario_runs += aggregate.scenario_runs ?? 0;
  sum.process_passes += aggregate.process_passes ?? 0;
  sum.final_passes += aggregate.final_passes ?? 0;
  sum.lucky_passes += aggregate.lucky_passes ?? 0;
  sum.L1_passes += aggregate.L1_passes ?? 0;
  sum.L2_passes += aggregate.L2_passes ?? 0;
  sum.L3_passes += aggregate.L3_passes ?? 0;
  return sum;
}, {
  scenario_runs: 0,
  process_passes: 0,
  final_passes: 0,
  lucky_passes: 0,
  L1_passes: 0,
  L2_passes: 0,
  L3_passes: 0
});
const ratio = (value: number): string => totals.scenario_runs === 0
  ? "0.0%"
  : `${(value / totals.scenario_runs * 100).toFixed(1)}%`;
const summary = {
  schema_version: "gametestlab.codebuddy-batch-summary.v1",
  batch_id: manifest.batch_id,
  generated_at: new Date().toISOString(),
  scoring_status: "provisional_requires_oracle_review",
  active_task_set_version: activeManifest.version,
  prepared_tasks: (manifest.tasks as Array<Record<string, any>>).filter((task) => activeIds.has(String(task.id))).length,
  original_batch_tasks: manifest.tasks.length,
  excluded_task_ids: manifest.tasks.filter((task: Record<string, any>) => !activeIds.has(String(task.id))).map((task: Record<string, any>) => task.id),
  evaluated_tasks: taskSummaries.length,
  totals,
  rates: {
    process: ratio(totals.process_passes),
    final: ratio(totals.final_passes),
    L1: ratio(totals.L1_passes),
    L2: ratio(totals.L2_passes),
    L3: ratio(totals.L3_passes)
  },
  tasks: taskSummaries
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const markdown = [
  `# ${manifest.batch_id} 评测结果`,
  "",
  `已准备 ${summary.prepared_tasks} 道题，已评测 ${summary.evaluated_tasks} 道。每道题只生成一次。`,
  `按当前任务集统计；历史批次中已移除的 ${summary.excluded_task_ids.length} 道题不计入下表，旧游戏与证据仍保留。`,
  "以下是原始断言计数，含待复核的文案误报；未检查某层的路径也包含在原始分母中。不能直接用作正式模型分数。",
  "先看[结果复核](review.md)，再看下表。成功、失败、重开路径混合计数，终局断言通过率不等于游戏通关率。",
  "",
  "| 游戏 | 类型 | 难度 | 过程通过 | 终局通过 | L1 | L2 | L3 | 协议问题 |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...taskSummaries.map((task) => {
    const item = task.aggregate ?? {};
    const runs = item.scenario_runs ?? 0;
    return `| ${task.id} | ${task.category} | ${task.difficulty} | ${item.process_passes ?? 0}/${runs} | ${item.final_passes ?? 0}/${runs} | ${item.L1_passes ?? 0}/${runs} | ${item.L2_passes ?? 0}/${runs} | ${item.L3_passes ?? 0}/${runs} | ${task.contract_findings} |`;
  }),
  "",
  `合计：过程 ${summary.rates.process}，终局 ${summary.rates.final}，L1 ${summary.rates.L1}，L2 ${summary.rates.L2}，L3 ${summary.rates.L3}；lucky pass ${totals.lucky_passes} 次。`,
  "",
  "各层原始状态（通过 / 失败 / 被上游阻断 / 未验证 / 仅观察）：",
  "",
  ...taskSummaries.map((task) => `- ${task.id}：` + ["L1", "L2", "L3"].map((layer) => {
    const counts = task.gates[layer];
    return `${layer} ${["pass", "fail", "blocked", "unverified", "observed_not_certified"].map((status) => counts[status] ?? 0).join(" / ")}`;
  }).join("；")),
  "",
  "复现情况：",
  "",
  ...taskSummaries.flatMap((task) => task.scenarios.map((scenario: Record<string, any>) =>
    `- ${task.id}/${scenario.id}：过程 ${scenario.process_passes}/${scenario.replays}，终局 ${scenario.final_passes}/${scenario.replays}${scenario.stable_process && scenario.stable_final ? "，通过/失败结果一致" : "，通过/失败结果不一致"}；检查点状态${scenario.stable_checkpoint_states ? "一致" : "未证实一致"}`
  )),
  "",
  "## 复跑",
  "",
  "[证据目录](evidence/index.json)包含未人工修改的生成游戏、题面、生成记录、逐步状态和截图。安装依赖与 Chromium 后，在仓库根目录运行：",
  "",
  "```bash",
  "pnpm run eval:task -- --task science-lab --task-dir results/codebuddy-hy3-pilot/evidence/science-lab/task --game-dir results/codebuddy-hy3-pilot/evidence/science-lab/game --replays 3 --generator codebuddy-hy3",
  "```",
  "",
  "这会重跑冻结断言，包括已知误报。诊断对照另存，不覆盖原始评分记录。"
];
await writeFile(resolve(outputDirectory, "README.md"), `${markdown.join("\n")}\n`, "utf8");
console.log(`Summarized ${taskSummaries.length} evaluated tasks: ${resolve(outputDirectory, "README.md")}`);
