import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SolutionPlan, ProcessReview } from "../src/contracts/process-review";
import { contentHash } from "../src/evaluation/generation-provenance";

const root = resolve(process.argv[2] ?? "results/process-15-v1/particle-orchestra");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
if (!brief.includes("正确输入推进 progress 并增加25分") || !brief.includes("完整输入 A、C、D、B 时获胜并得到100分")) throw new Error("Public score rule changed");
const plan = SolutionPlan.parse(await json(resolve(root, "solution-plan.json")));
const step = plan.steps.find(s => s.id === 3);
if (!step || !step.implementation.includes("score+=25") || !step.implementation.includes("score+=100")) throw new Error("Original plan step 3 changed");
const browser = await json(resolve(root, "browser/result.json"));
const actual = browser.scenarios.filter((s: any) => s.scenario_id === "win-path").map((s: any) =>
  s.observations.find((o: any) => o.checkpoint_id === "PO-CP-WON")?.state.score);
if (actual.length !== 3 || actual.some((score: any) => !Number.isInteger(score))) throw new Error("Expected three completed win observations");
const reviewFile = await json(resolve(root, "review.json"));
if (reviewFile.model !== "hy3" || reviewFile.model_verified !== true) throw new Error("Missing Hy3 review");
const review = ProcessReview.parse(reviewFile.verdict);
const result = { scope: "Selected publicly arithmetic score claim and actual three-run browser result; not entire-plan exhaustive gold",
  brief_sha256: contentHash(brief), step_id: 3, public_final_score: 4 * 25, plan_predicted_final_score: 4 * 25 + 100,
  browser_final_scores: actual, selected_claim_wrong: actual.every((score: number) => score === 200),
  hy3_first_error_plan_step: review.first_error_step, hy3_localization_matches_selected_step: review.first_error_step === 3,
  unrelated_private_oracle_diff: "active_cluster expected B at terminal is not specified by the public brief" };
await writeFile(resolve(root, "score-plan-claim.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "SCORE-PLAN-CLAIM.md"), ["# 得分主张：方案第 3 步", "",
  "公开规则是四次正确输入各得 25 分，完整通关总分 100。原方案和最终代码却在第四次输入后额外加 100，三次 Chromium 通关实际都是 200 分。", "",
  `混元把原方案第 ${review.first_error_step ?? "?"} 步定位为题意误读；与独立算术标准和浏览器复现一致。终局 active_cluster 必须为 B 是另一个缺公开依据的检查，不能与得分错误合并。`, ""
].join("\n"));
console.log(JSON.stringify({ public_final_score: result.public_final_score, browser_final_scores: actual,
  hy3_localization_matches_selected_step: result.hy3_localization_matches_selected_step }));
