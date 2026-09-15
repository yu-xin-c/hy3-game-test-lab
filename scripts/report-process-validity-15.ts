import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";

const root = resolve(process.argv[2] ?? "results/process-15-v1");
const load = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const progress = await load(resolve(root, "progress-summary.json"));
const scope = await load(resolve(root, "scope.json"));
if (scope.selected_ids.length !== 15) throw new Error("Expected frozen 15-task scope");
const reused = new Map(scope.reused_completed_games.map((entry: any) => [entry.id, entry.source]));
const sourceDir = (id: string) => resolve(reused.get(id) as string ?? resolve(root, id));
const review = async (id: string) => (await load(resolve(sourceDir(id), "review.json"))).verdict;
const grid = await load(resolve(root, "grid-plan-claims.json"));
const keyDoor = grid.rows.find((row: any) => row.id === "key-door-escape");
if (keyDoor?.step_id !== 1 || !keyDoor.wrong_symbols.includes("T")) throw new Error("Key Door public-map gold changed");
const room = await load(resolve(root, "room-five-in-row/room-plan-claims.json"));
if (room.earliest_known_wrong_step !== 4 || room.selected[0]?.browser_passes !== 0 || room.replays !== 3) throw new Error("Room selected-plan gold changed");
const particle = await load(resolve(root, "particle-orchestra/score-plan-claim.json"));
if (particle.step_id !== 3 || particle.public_final_score !== 100 || particle.plan_predicted_final_score !== 200 || !particle.browser_final_scores.every((n: number) => n === 200)) throw new Error("Particle score gold changed");
const wrongAnswerSelected = [
  { id: "key-door-escape", difficulty: "D2", gold_step: 1, basis: "公开地图 T 坐标", limit: "只核对明确写出的坐标，不保证整份方案首错", review: await review("key-door-escape") },
  { id: "room-five-in-row", difficulty: "D2", gold_step: 4, basis: "双页真输入与重启计时，3 次", limit: "前 3 步只测试了核心路径，第 4 步是首个已知错步", review: await review("room-five-in-row") },
  { id: "particle-orchestra", difficulty: "D3", gold_step: 3, basis: "公开算术及 3 次浏览器终局", limit: "只核对选出的计分断言", review: await review("particle-orchestra") }
].map(({ review: verdict, ...row }) => ({ ...row, model_process_wrong: verdict.process_correct === false,
  model_step: verdict.first_error_step, combined_hit: verdict.process_correct === false && verdict.first_error_step === row.gold_step,
  step_only_hit: verdict.first_error_step === row.gold_step }));
const mini = await load(resolve(root, "mini-farm/start-timing-probe.json"));
if (mini.immediate_buttons_disabled_after_start !== 3 || mini.buttons_enabled_after_32ms_frame !== 3 || mini.grounded_three_plot_win_passes !== 3) throw new Error("Mini Farm grounded timing evidence changed");
const miniReview = await review("mini-farm");
const miniSelected = { id: "mini-farm", selected_plan_step: 1, original_plan_direct_click_claim_fails: true,
  model_process_wrong: miniReview.process_correct === false, model_step: miniReview.first_error_step,
  model_selected_step_hit: miniReview.process_correct === false && miniReview.first_error_step === 1,
  limit: "The direct-click assertion fails under a frozen clock but public core play succeeds after 32ms; final-answer failure status is timing-sensitive, so this case is not pooled with clear wrong-final subset" };
const direct2048 = await load(resolve(root, "persistent-2048/direct-process-review/review.json"));
const directReceipt = await load(resolve(root, "persistent-2048/direct-process-review/call/receipt.json"));
const directPrompt = await readFile(resolve(root, "persistent-2048/direct-process-review/call/prompt.txt"), "utf8");
if (directReceipt.model !== "hy3" || directReceipt.model_verified !== true || directReceipt.prompt_sha256 !== contentHash(directPrompt) || direct2048.model !== "hy3" || !direct2048.model_verified) throw new Error("2048 supplemental Hy3 receipt invalid");
if (direct2048.gold_subset.selected_plan_step !== 3 || !direct2048.gold_subset.localization_match) throw new Error("2048 selected counterexample changed");
const selected2048 = { id: "persistent-2048", difficulty: "D2", gold_core_outcome_correct: true, gold_plan_step: 3,
  model_core_outcome_correct: direct2048.verdict.core_game_outcome_correct,
  model_process_wrong: direct2048.verdict.original_plan_process_correct === false,
  model_step: direct2048.verdict.earliest_wrong_plan_step,
  true_issue_among_flagged: direct2048.verdict.original_plan_process_correct === false && direct2048.verdict.earliest_wrong_plan_step === 3,
  limit: "独立补充复核；原始全题复核未判定。只覆盖核心玩法与选出的方案第 3 步，不能算完整接口或全题正确率。" };
const combined = wrongAnswerSelected.filter(r => r.combined_hit).length;
const stepOnly = wrongAnswerSelected.filter(r => r.step_only_hit).length;
const output = { scope: "Frozen first 15 games; independently checkable selected public-plan claims, not full-plan gold",
  completed_games: progress.completed_games, selected_games: 15,
  original_full_review_wrong_answer_subset: { total: wrongAnswerSelected.length, detect_and_locate: combined, step_only: stepOnly,
    rate: `${combined}/${wrongAnswerSelected.length}`, rows: wrongAnswerSelected },
  supplemental_core_correct_plan_wrong_subset: { total: 1, flagged: Number(selected2048.model_process_wrong), real_issue_among_flagged: Number(selected2048.true_issue_among_flagged),
    false_alarm_among_flagged: Number(selected2048.model_process_wrong && !selected2048.true_issue_among_flagged), row: selected2048 },
  timing_sensitive_plan_claim_not_pooled: miniSelected,
  targeted_prefix_review_not_pooled: "Platform Rescue / Signal Memory 2/2 selected-step hits use a different targeted prompt; do not pool with original full-review rate",
  limitations: ["Original full-review 1/3 is a selected, heterogeneous small subset; Room step 4 is first known, not exhaustive gold.",
    "The 2048 correct-core counterexample is one supplemental Hy3 call and not a statistically reliable false-positive rate.",
    "A correct published plan and final game must both be independently established before classifying a false alarm; model opinions alone cannot provide that gold."] };
await writeFile(resolve(root, "process-validity.json"), JSON.stringify(output, null, 2) + "\n");
await writeFile(resolve(root, "PROCESS-VALIDITY.md"), ["# 过程定位有效性：独立可核对的子集", "",
  `原始全题复核在 3 个已找到公开方案错误的题目上，同时判“过程有错”并定位到核对步的结果为 ${combined}/3；只看步骤数字是 ${stepOnly}/3，不能混用。`, "",
  "| 游戏 | 核对出的步 | 原始复核判过程错 | 原始复核给出的步 | 同时检出并定位 |", "| --- | ---: | --- | ---: | --- |",
  ...wrongAnswerSelected.map(r => `| ${r.id} | ${r.gold_step} | ${r.model_process_wrong ? "是" : "否"} | ${r.model_step ?? "—"} | ${r.combined_hit ? "是" : "否"} |`), "",
  "2048 核心玩法实际通关、失败和存档成立，但原方案第 3 步把一条获胜路径写成失败。补充的混元复核在这个单例中找到了真实问题（1/1），被标记的正确核心游戏中误报为 0/1。这与上表使用不同提示，不能合并计算总体准确率。", "",
  "Mini Farm 原方案第 1 步的连续点击断言，在冻结时钟下因按钮尚未启用 3/3 失败；推进 32ms 后核心三田通关 3/3。原混元判过程错但不给首错步，这次选定断言漏定位。公开规则未写点击必须零延迟，因此这个时间敏感单例不并入上表的明确终局错误样本。", "",
  "平台跳跃和记忆重置的两个定向复核也各命中所选步骤（2/2），同样不并入原始全题复核。以上标准只覆盖可独立计算或用真输入复现的方案陈述；Room 第 4 步是已测核心前缀后的首个已知错步，不声称整份方案所有更早子陈述都正确。样本太少，误报比例只描述这一个已核对样本。", ""
].join("\n"));
console.log(JSON.stringify({ completed: progress.completed_games, original_full_review_combined: `${combined}/3`, original_full_review_step_only: `${stepOnly}/3`, correct_core_flagged_real_issue: Number(selected2048.true_issue_among_flagged) }));
