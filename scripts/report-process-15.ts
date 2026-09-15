import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProcessReview, SolutionPlan } from "../src/contracts/process-review";
import { contentHash, reconstructGeneration } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--root");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[at + 1]!);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const scope = await json(resolve(root, "scope.json"));
if (scope.schema_version !== "hy3-process-15-scope.v1" || scope.selected_ids.length !== 15 || scope.reused_completed_games.length !== 5 || scope.new_game_ids.length !== 10) throw new Error("Invalid 15-task scope");
const reused = new Map(scope.reused_completed_games.map((r: any) => [r.id, r.source]));
const rows: any[] = [], pending: any[] = [];
for (const id of scope.selected_ids) {
  const dir = resolve(reused.get(id) as string ?? resolve(root, id));
  let status;
  try { status = await json(resolve(dir, "status.json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; pending.push({ id, stage: "not_started" }); continue; }
  if (status.stage !== "complete") { pending.push({ id, stage: status.stage }); continue; }
  const plan = SolutionPlan.parse(await json(resolve(dir, "solution-plan.json")));
  const names = (await readdir(resolve(dir, "game"))).sort((a, b) => a.localeCompare(b));
  const game = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(dir, "game", name), "utf8")] as const)));
  if (!reconstructGeneration((await json(resolve(dir, "generation-tools.json"))).calls, game).complete) throw new Error(`Write/Edit reconstruction failed: ${id}`);
  let bundle = "";
  for (const name of names) bundle += name + "\0" + game[name] + "\0";
  const browser = await json(resolve(dir, "browser/result.json"));
  if (contentHash(bundle) !== browser.input_hashes.game_directory_sha256) throw new Error(`Executed game changed: ${id}`);
  for (const call of ["plan-call", "generation-call", "review-call"]) {
    const receipt = await json(resolve(dir, call, "receipt.json"));
    if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(await readFile(resolve(dir, call, "prompt.txt"), "utf8"))) throw new Error(`Invalid Hy3 ${call} receipt: ${id}`);
  }
  const saved = await json(resolve(dir, "review.json"));
  if (saved.model !== "hy3" || saved.model_verified !== true) throw new Error(`Review is not Hy3: ${id}`);
  const review = ProcessReview.parse(saved.verdict);
  const paths = browser.scenarios.filter((s: any) => s.replay_index === 0);
  rows.push({ id, source: reused.get(id) ?? `results/process-15-v1/${id}`, difficulty: browser.difficulty.level, category: browser.category,
    plan_steps: plan.steps.length, browser_paths: paths.length, replayed_runs: browser.scenarios.length,
    raw_final_paths_passed: paths.filter((s: any) => s.evaluation.final_outcome_correct === true).length,
    raw_process_paths_passed: paths.filter((s: any) => s.evaluation.process_correct === true).length,
    hy3_final_correct: review.final_correct, hy3_process_correct: review.process_correct, hy3_first_error_plan_step: review.first_error_step,
    hy3_apparent_pass_with_flaw: review.apparent_pass_with_flaw,
    hy3_supported_defect_types: review.findings.filter(f => f.status === "supported_defect").map(f => f.kind) });
}
const counts = (list: any[]) => ({ games: list.length, raw_final_paths_passed: list.reduce((n, r) => n + r.raw_final_paths_passed, 0),
  raw_browser_paths: list.reduce((n, r) => n + r.browser_paths, 0), hy3_final_true: list.filter(r => r.hy3_final_correct === true).length,
  hy3_final_known: list.filter(r => r.hy3_final_correct !== null).length, hy3_process_true: list.filter(r => r.hy3_process_correct === true).length,
  hy3_process_known: list.filter(r => r.hy3_process_correct !== null).length });
const errorTypes: Record<string, number> = {};
for (const row of rows) for (const type of row.hy3_supported_defect_types) errorTypes[type] = (errorTypes[type] ?? 0) + 1;
const summary = { scope: "First 15 frozen tasks; progress only, not full answer/process accuracy", selected_games: 15, completed_games: rows.length,
  pending, counts: counts(rows), difficulty_composition: scope.difficulty, category_composition: scope.category,
  by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(d => [d, counts(rows.filter(r => r.difficulty === d))])),
  hy3_supported_defect_types: errorTypes, rows,
  boundary: "The public-check source audit is complete for 15 tasks, but quote matching and model labels alone do not prove semantic oracle correctness; independently executed plan claims remain a small subset." };
await writeFile(resolve(root, "progress-summary.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(root, "PROGRESS.md"), ["# 15 题生成过程进度", "",
  `${rows.length}/15 题已完成混元先写编号方案、再生成代码、Chromium 真输入与混元复核。前三款原始方案及另两款已完成的生成记录保留原件，新批次只生成剩余 10 款。`, "",
  "| 题目 | 难度 | 原方案步数 | 浏览器原始终局路径 | Hy3 最终意见 | Hy3 过程意见 | 原方案首错意见 |", "| --- | --- | ---: | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.difficulty} | ${r.plan_steps} | ${r.raw_final_paths_passed}/${r.browser_paths} | ${r.hy3_final_correct === null ? "未知" : r.hy3_final_correct ? "正确" : "错误"} | ${r.hy3_process_correct === null ? "未知" : r.hy3_process_correct ? "正确" : "错误"} | ${r.hy3_first_error_plan_step ?? "—"} |`), "",
  `仍有 ${pending.length} 题未完成。前 15 题 D1/D2/D3 为 4/6/5，动作/益智/创意/模拟为 6/5/2/2，没有教育类；不能外推整个 96 题。`, "",
  "表内浏览器通过数沿用原检查，是原始执行结果；Hy3 最终与过程栏是模型意见。公开判据来源核对虽完成 15/15，模型引文并不自动证明取值或比较方式成立，不能据此称为正式正确率。独立方案步骤标准另见 ../plan-claims-cross-game-v2/REPORT.md 和 ../signal-reset-process-v1/REPORT.md。", "",
  "操作首错、代码堆栈/Write/Edit 来源与公开编号方案首错分开。已修复的早期方案错误和最终实现缺陷也分别记录。", ""
].join("\n"));
console.log(JSON.stringify({ selected_games: 15, completed_games: rows.length, pending: pending.length, counts: summary.counts }));
