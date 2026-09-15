import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SolutionPlan, ProcessReview } from "../src/contracts/process-review";

const root = resolve(process.argv[2] ?? "results/process-15-v1/room-five-in-row");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const status = await json(resolve(root, "status.json"));
if (status.stage !== "complete") throw new Error("Wait for complete Hy3 generation and review");
const brief = await readFile(resolve(root, "task/brief.md"), "utf8");
if (!brief.includes("Restart 同步清空棋盘、回合、步数和房间状态")) throw new Error("Public room reset rule changed");
const plan = SolutionPlan.parse(await json(resolve(root, "solution-plan.json")));
if (!plan.steps[3]?.implementation.includes("tick=0") || !plan.steps[4]?.implementation.includes("connected 保持")) throw new Error("Original numbered plan changed");
const probe = await json(resolve(root, "grounded-room-probe.json"));
if (probe.replays !== 3 || probe.primary_win_passes !== 3 || probe.secondary_win_passes !== 3 || probe.start_waits_for_join !== 6) throw new Error("Earlier gameplay prefix not stably replayed");
const reviewFile = await json(resolve(root, "review.json"));
if (reviewFile.model !== "hy3" || reviewFile.model_verified !== true) throw new Error("Hy3 review missing");
const review = ProcessReview.parse(reviewFile.verdict);
const selected = [
  { step_id: 4, claim: "reset sets tick to zero", browser_passes: probe.plan_step4_tick_reset_passes,
    observed: probe.rows.filter((r: any) => r.scenario === "primary-win-and-restart").map((r: any) => ({ before: r.tick_probe.before.tick, after: r.tick_probe.after.tick })) },
  { step_id: 5, claim: "Restart preserves connected room and playing", browser_passes: probe.restart_room_clear_passes,
    observed: probe.rows.filter((r: any) => r.scenario === "primary-win-and-restart").map((r: any) => ({ status: r.restarted[0].observation.state.status,
      connected: r.restarted[0].observation.state.connected })) }
];
const result = { scope: "First known failed original-plan claim after tested core steps 1-3; not all subclaims of steps 1-3 or complete entire-plan gold",
  game_directory_sha256: probe.game_directory_sha256, replays: 3, core_prefix: { join: probe.start_waits_for_join,
    primary_win: probe.primary_win_passes, secondary_win: probe.secondary_win_passes },
  selected, earliest_known_wrong_step: selected.find(c => c.browser_passes < probe.replays)?.step_id ?? null,
  hy3_first_error_step: review.first_error_step, hy3_selected_step_findings: review.findings.filter(f => [4, 5].includes(f.step_id ?? -1)).map(f => ({ step_id: f.step_id, kind: f.kind, status: f.status })) };
await writeFile(resolve(root, "room-plan-claims.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "ROOM-PLAN-CLAIMS.md"), ["# 五子棋生成方案的首个已知错误", "",
  "真实双页面输入确认加入流程 6/6、P1/P2 获胜各 3/3；这些只覆盖前三步的核心玩法，不证明每个文字细节。", "",
  "原方案第 4 步明确说 `reset({seed})` 使 `tick=0`；重放 3 次均观察到 reset 后 tick 继续增长。第 5 步明确说重开保持连接/Playing；题面要求清空房间状态，重放 3 次都保持 connected=true。", "",
  `因此第 4 步是目前已执行前缀中第一个已知错误主张；混元复核未给出首错步骤（${review.first_error_step ?? "null"}），对这份已知反例漏定位。未测试的更早文字主张仍不凭空宣布正确。`, ""
].join("\n"));
console.log(JSON.stringify({ earliest_known_wrong_step: result.earliest_known_wrong_step,
  hy3_first_error_step: result.hy3_first_error_step, selected_claims: selected.length }));
