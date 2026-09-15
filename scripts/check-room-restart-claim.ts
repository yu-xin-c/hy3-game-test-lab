import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SolutionPlan, ProcessReview } from "../src/contracts/process-review";
import { contentHash } from "../src/evaluation/generation-provenance";

const root = resolve(process.argv[2] ?? "results/process-15-v1/room-five-in-row");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const status = await json(resolve(root, "status.json"));
if (status.task_id !== "room-five-in-row" || status.stage !== "complete") throw new Error("Wait for the complete Hy3 review before reporting this case");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
if (!brief.includes("Restart 同步清空棋盘、回合、步数和房间状态")) throw new Error("Public restart rule changed");
const plan = SolutionPlan.parse(await json(resolve(root, "solution-plan.json")));
const step = plan.steps.find(s => s.id === 5);
if (!step || !step.implementation.includes("connected 保持") || !step.implementation.includes("status='Playing'")) throw new Error("Original plan step 5 changed");
const browser = await json(resolve(root, "browser/result.json"));
const paths = browser.scenarios.filter((s: any) => s.scenario_id === "restart-path");
if (paths.length !== 3) throw new Error("Expected three isolated browser replays");
const observations = paths.map((s: any) => s.observations.find((o: any) => o.checkpoint_id === "FR-CP-RESET"));
if (observations.some((o: any) => !o)) throw new Error("Missing restart observation");
const violating = observations.filter((o: any) => o.state.connected === true && o.state.status === "playing").length;
const reviewFile = await json(resolve(root, "review.json"));
if (reviewFile.model !== "hy3" || reviewFile.model_verified !== true) throw new Error("Review must be Hy3");
const review = ProcessReview.parse(reviewFile.verdict);
const result = { scope: "Selected original public-plan step 5, not the verified first wrong step of the entire plan",
  brief_sha256: contentHash(brief), plan_step_id: 5, plan_claim: step.implementation,
  public_rule: "Restart synchronously clears board, turn, moves and room state",
  observed_connected_and_playing_after_restart: violating, replays: paths.length,
  selected_claim_inconsistent: violating === paths.length,
  hy3_first_error_plan_step: review.first_error_step,
  hy3_step5_findings: review.findings.filter(f => f.step_id === 5).map(f => ({ kind: f.kind, status: f.status })) };
await writeFile(resolve(root, "restart-plan-claim.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "RESTART-PLAN-CLAIM.md"), ["# 原方案第 5 步：重开后连接状态", "",
  `题面要求 Restart 清空房间状态；原方案第 5 步却明确写“connected 保持、status=Playing”。真实浏览器重放 ${paths.length} 次，${violating} 次重开后仍 connected=true、playing。这个选定主张不成立。`, "",
  `混元整份方案的原首错意见为 ${review.first_error_step ?? "未给出"}；第 5 步相关意见见 restart-plan-claim.json。只证明选定第 5 步，不凭此认定全方案最早错误必在第 5 步。`, ""
].join("\n"));
console.log(JSON.stringify({ selected_claim_inconsistent: result.selected_claim_inconsistent, replays: result.replays, hy3_first_error_plan_step: review.first_error_step }));
