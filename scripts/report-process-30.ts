import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SolutionPlan, ProcessReview } from "../src/contracts/process-review";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";

const index = process.argv.indexOf("--root");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[index + 1]!);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const scope = await json(resolve(root, "scope.json"));
if (scope.schema_version !== "hy3-process-30-scope.v1" || scope.selected_ids.length !== 30 || scope.existing_public_plan_games.length !== 3 || scope.new_public_plan_game_ids.length !== 27) throw new Error("Invalid frozen 30-task process scope");
const baseline = new Map(scope.existing_public_plan_games.map((item: any) => [item.id, item.source]));
const rows: any[] = [], pending: any[] = [];
for (const id of scope.selected_ids) {
  const dir = resolve(baseline.get(id) as string ?? resolve(root, id));
  let status;
  try { status = await json(resolve(dir, "status.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; pending.push({ id, stage: "not_started" }); continue; }
  if (status.stage !== "complete") { pending.push({ id, stage: status.stage }); continue; }
  const planText = await readFile(resolve(dir, "solution-plan.json"), "utf8");
  const plan = SolutionPlan.parse(JSON.parse(planText));
  const names = (await readdir(resolve(dir, "game"))).sort((a, b) => a.localeCompare(b));
  const game = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(dir, "game", name), "utf8")] as const)));
  const provenance = reconstructGeneration((await json(resolve(dir, "generation-tools.json"))).calls, game);
  if (!provenance.complete) throw new Error(`Generation provenance incomplete: ${id}`);
  let bundle = "";
  for (const name of names) bundle += name + "\0" + game[name] + "\0";
  const browser = await json(resolve(dir, "browser/result.json"));
  if (contentHash(bundle) !== browser.input_hashes.game_directory_sha256) throw new Error(`Browser did not run frozen generated code: ${id}`);
  for (const call of ["plan-call", "generation-call", "review-call"]) {
    const receipt = await json(resolve(dir, call, "receipt.json"));
    if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(await readFile(resolve(dir, call, "prompt.txt"), "utf8"))) throw new Error(`Invalid Hy3 ${call} receipt: ${id}`);
  }
  const published = await json(resolve(dir, "review.json"));
  if (published.model !== "hy3" || published.model_verified !== true) throw new Error(`Invalid process review model: ${id}`);
  const review = ProcessReview.parse(published.verdict);
  const firstReplay = browser.scenarios.filter((s: any) => s.replay_index === 0);
  rows.push({ id, difficulty: browser.difficulty.level, category: browser.category, original_plan_steps: plan.steps.length,
    browser_paths: firstReplay.length, replayed_runs: browser.scenarios.length,
    raw_browser_final_paths_passed: firstReplay.filter((s: any) => s.evaluation.final_outcome_correct === true).length,
    raw_browser_process_paths_passed: firstReplay.filter((s: any) => s.evaluation.process_correct === true).length,
    hy3_final_correct: review.final_correct, hy3_process_correct: review.process_correct,
    hy3_first_error_plan_step: review.first_error_step, hy3_apparent_pass_with_flaw: review.apparent_pass_with_flaw,
    supported_defect_types: review.findings.filter(f => f.status === "supported_defect").map(f => f.kind),
    code_history_complete: provenance.complete, baseline_reused: baseline.has(id) });
}
const count = (group: any[]) => ({ completed_games: group.length, raw_browser_final_paths_passed: group.reduce((n, r) => n + r.raw_browser_final_paths_passed, 0),
  raw_browser_paths: group.reduce((n, r) => n + r.browser_paths, 0), hy3_final_true: group.filter(r => r.hy3_final_correct === true).length,
  hy3_final_known: group.filter(r => r.hy3_final_correct !== null).length, hy3_process_true: group.filter(r => r.hy3_process_correct === true).length,
  hy3_process_known: group.filter(r => r.hy3_process_correct !== null).length });
const errors: Record<string, number> = {};
for (const row of rows) for (const kind of row.supported_defect_types) errors[kind] = (errors[kind] ?? 0) + 1;
const summary = { scope: "30 chosen tasks; all generated plans are public pre-implementation outputs; progress not final benchmark accuracy",
  selected_games: 30, completed_games: rows.length, pending, counts: count(rows),
  by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(d => [d, count(rows.filter(r => r.difficulty === d))])),
  by_category: Object.fromEntries(["action", "puzzle", "creative", "simulation", "education"].map(c => [c, count(rows.filter(r => r.category === c))])),
  hy3_supported_defect_types: errors, rows,
  source_standard_status: "The public-check audit of these 30 tasks is separate and ongoing; raw browser pass and Hy3 opinions are not independently certified full answers.",
  plan_validity_status: "Independent selected-claim evidence currently covers only three original games, with unequal step depth; code Write/Edit source and operation divergence are separately recorded." };
await writeFile(resolve(root, "progress-summary.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(root, "PROGRESS.md"), ["# 30 题生成过程进度", "",
  `${rows.length}/30 题完成混元公开编号方案、代码生成、真实 Chromium 操作与混元复核。复用原始三题方案，其余 27 题重新先写方案后写代码。该固定子集动作类 18/30，不能代表整份 96 题的类型分布。`, "",
  "| 题目 | 难度 | 方案步数 | 浏览器原始终局路径 | Hy3 最终意见 | Hy3 过程意见 | 方案首错意见 |", "| --- | --- | ---: | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.difficulty} | ${r.original_plan_steps} | ${r.raw_browser_final_paths_passed}/${r.browser_paths} | ${r.hy3_final_correct === null ? "未知" : r.hy3_final_correct ? "正确" : "错误"} | ${r.hy3_process_correct === null ? "未知" : r.hy3_process_correct ? "正确" : "错误"} | ${r.hy3_first_error_plan_step ?? "—"} |`), "",
  `未完成 ${pending.length} 题。浏览器路径通过数是原检查的原始结果；公开判据来源审计和独立方案步骤核验完成前，不把它或 Hy3 意见写成正式正确率。`, "",
  "Signal Memory 原批次的 Hy3 过程意见保留在表内，但后续独立方案步骤实验已经反驳其第 2 步与第 5 步的选定主张，见 ../plan-claims-cross-game-v2/REPORT.md 与 ../signal-reset-process-v1/REPORT.md。原意见不自动改写成独立标准。", "",
  "操作首错、执行代码堆栈和生成 Write/Edit 步骤、原编号方案首错分别记录。Maze Collector 等代码错误可能让整个游戏无法运行，而原公开方案主张本身未必错误；不能把两种首错强行写成同一编号。", ""
].join("\n"));
console.log(JSON.stringify({ completed_games: rows.length, selected_games: 30, counts: summary.counts, pending: pending.length }));
