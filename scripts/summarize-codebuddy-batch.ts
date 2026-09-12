import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
const tasks = (manifest.tasks as Array<Record<string, any>>).filter(
  (task) => requestedTaskIds.size === 0 || requestedTaskIds.has(String(task.id))
);
const taskSummaries: Array<Record<string, any>> = [];

for (const task of tasks) {
  const generationPath = resolve(batchDirectory, "generated", task.id, "generation.json");
  let generation: Record<string, any>;
  try {
    generation = await readJson(generationPath);
  } catch {
    continue;
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
    scenarios: [...scenarioGroups].map(([id, entries]) => {
      const evaluations = entries.map((entry) => entry.evaluation ?? {});
      return {
        id,
        replays: entries.length,
        process_passes: evaluations.filter((entry) => entry.process_correct === true).length,
        final_passes: evaluations.filter((entry) => entry.final_outcome_correct === true).length,
        lucky_passes: evaluations.filter((entry) => entry.lucky_pass_detected === true).length,
        stable_process: new Set(evaluations.map((entry) => entry.process_correct)).size <= 1,
        stable_final: new Set(evaluations.map((entry) => entry.final_outcome_correct)).size <= 1,
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
  prepared_tasks: (manifest.tasks as unknown[]).length,
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
  "复现情况：",
  "",
  ...taskSummaries.flatMap((task) => task.scenarios.map((scenario: Record<string, any>) =>
    `- ${task.id}/${scenario.id}：过程 ${scenario.process_passes}/${scenario.replays}，终局 ${scenario.final_passes}/${scenario.replays}${scenario.stable_process && scenario.stable_final ? "，三次一致" : "，三次不完全一致"}`
  ))
];
await writeFile(resolve(outputDirectory, "README.md"), `${markdown.join("\n")}\n`, "utf8");
console.log(`Summarized ${taskSummaries.length} evaluated tasks: ${resolve(outputDirectory, "README.md")}`);
