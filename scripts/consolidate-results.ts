import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const values = (name: string) => process.argv.flatMap((value, index) => value === name ? [process.argv[index + 1]] : []).filter(Boolean) as string[];
const sourceArgs = values("--source");
const outIndex = process.argv.indexOf("--out");
if (sourceArgs.length < 2 || outIndex < 0 || !process.argv[outIndex + 1]) {
  throw new Error("Usage: consolidate-results.ts --source DIR --source DIR [...] --out DIR");
}

const sources = sourceArgs.map(source => resolve(source));
const output = resolve(process.argv[outIndex + 1]!);
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const summaries = await Promise.all(sources.map(source => json(resolve(source, "summary.json"))));
const manifest = await json(resolve(sources[0]!, "batch-manifest.json"));
const expectedIds = manifest.tasks.map((task: any) => task.id);
const selected: any[] = [];

for (const id of expectedIds) {
  const candidates = summaries.flatMap((summary, index) => {
    const task = summary.tasks.find((item: any) => item.id === id);
    return task?.aggregate?.scenario_runs > 0 && task.hy3_review ? [{ task, source: sources[index], batch_id: summary.batch_id }] : [];
  });
  const chosen = candidates.at(-1);
  if (!chosen) throw new Error(`No tested and Hy3-reviewed result for ${id}`);
  selected.push({ ...chosen.task, source_batch: chosen.batch_id, source_results: chosen.source });
}

const countGroup = (group: any[]) => ({
  tasks: group.length,
  browser_tested_tasks: group.filter(task => task.aggregate?.scenario_runs > 0).length,
  hy3_reviewed_tasks: group.filter(task => task.hy3_review).length,
  all_paths_final_correct: group.filter(task => task.all_paths_final_correct).length,
  all_paths_process_correct: group.filter(task => task.all_paths_process_correct).length,
  path_runs: group.reduce((sum, task) => sum + task.aggregate.scenario_runs, 0),
  final_passes: group.reduce((sum, task) => sum + task.aggregate.final_passes, 0),
  process_passes: group.reduce((sum, task) => sum + task.aggregate.process_passes, 0)
});
const modelRows = selected.flatMap(task => task.hy3_review.scenarios.map((scenario: any) => ({ ...scenario, task_id: task.id, difficulty: task.difficulty })));
const modelCounts = (rows: any[]) => ({
  reviewed_scenarios: rows.length,
  final_known: rows.filter(row => row.final_outcome_correct !== null).length,
  final_correct: rows.filter(row => row.final_outcome_correct === true).length,
  process_known: rows.filter(row => row.process_correct !== null).length,
  process_correct: rows.filter(row => row.process_correct === true).length,
  lucky_pass: rows.filter(row => row.final_outcome_correct === true && row.process_correct === false).length,
  oracle_issue_scenarios: rows.filter(row => row.oracle_issues.length > 0).length
});
const disagreements = selected.flatMap(task => task.hy3_review.scenarios.flatMap((review: any) => {
  const raw = task.scenarios.find((scenario: any) => scenario.id === review.scenario_id);
  const rawProcess = raw?.process_passes === raw?.runs;
  if (!raw || review.process_correct === null || review.process_correct === rawProcess) return [];
  return [{ task_id: task.id, scenario_id: review.scenario_id, raw_process_correct: rawProcess, hy3_process_correct: review.process_correct }];
}));

const summary: any = {
  batch_id: "consolidated-96",
  generated_at: new Date().toISOString(),
  selection: "latest tested and Hy3-reviewed result for each frozen task",
  scoring_status: "raw_assertions_and_model_review_separate",
  all_tasks_completed: selected.length === expectedIds.length,
  totals: countGroup(selected),
  by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(level => [level, countGroup(selected.filter(task => task.difficulty === level))])),
  model_review: {
    status: "model_review_not_independent_gold",
    totals: modelCounts(modelRows),
    by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(level => [level, modelCounts(modelRows.filter(row => row.difficulty === level))])),
    process_disagreements: disagreements
  },
  source_batches: summaries.map((summary, index) => ({ batch_id: summary.batch_id, path: relative(output, sources[index]!) })),
  tasks: selected.map(({ source_results, ...task }) => ({ ...task, source_results: relative(output, source_results) }))
};

await mkdir(output, { recursive: true });
await writeFile(resolve(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(resolve(output, "batch-manifest.json"), `${JSON.stringify({ ...manifest, batch_id: "consolidated-96", source_batches: summary.source_batches }, null, 2)}\n`);
const rows = ["# 96 题去重汇总", "", "每题选用最新一份同时具有浏览器证据和 Hy3 复核的结果。失败尝试仍保留在原批次目录，不覆盖历史记录。", "",
  `完成 ${summary.totals.browser_tested_tasks}/${summary.totals.tasks} 题，浏览器运行 ${summary.totals.path_runs} 次。生成和模型复核均使用 Hy3。`,
  `原始规则过程通过 ${summary.totals.process_passes}/${summary.totals.path_runs} 次；整题所有路径过程通过 ${summary.totals.all_paths_process_correct}/${summary.totals.tasks}。`,
  `Hy3 过程判断正确 ${summary.model_review.totals.process_correct}/${summary.model_review.totals.process_known} 个可判断场景；与原始规则有 ${disagreements.length} 个场景不一致。`,
  "", "原始规则存在隐藏字段和文案误报，Hy3 复核也不是独立标准答案，两种口径分别保留。自动要求对照见 reports/validation-report.md。", "",
  "| 难度 | 游戏数 | 浏览器运行 | 原始过程通过 | 整题全路径过程通过 | Hy3 过程正确 / 可判断 |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...["D1", "D2", "D3"].map(level => {
    const raw: any = summary.by_difficulty[level];
    const model: any = summary.model_review.by_difficulty[level];
    return `| ${level} | ${raw.tasks} | ${raw.path_runs} | ${raw.process_passes}/${raw.path_runs} | ${raw.all_paths_process_correct}/${raw.tasks} | ${model.process_correct}/${model.process_known} |`;
  }), "", "## 结果来源", "", ...summary.source_batches.map((source: any) => `- ${source.batch_id}: ${source.path}`), ""];
await writeFile(resolve(output, "README.md"), rows.join("\n"));
console.log(JSON.stringify({ tasks: selected.length, browser_runs: summary.totals.path_runs, reviewed_scenarios: modelRows.length, disagreements: disagreements.length }, null, 2));
