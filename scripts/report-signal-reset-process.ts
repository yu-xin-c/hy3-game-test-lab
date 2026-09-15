import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--root");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[at + 1]!);
const json = async (name: string) => JSON.parse(await readFile(resolve(root, name), "utf8"));
const names = ["observations.json", "checks.json", "packet.json", "gold.json"];
const hashRecord = (await Promise.all(names.map(async name => `${contentHash(await readFile(resolve(root, name), "utf8"))}  ${name}`))).join("\n") + "\n";
if (hashRecord !== await readFile(resolve(root, "input-sha256.txt"), "utf8")) throw new Error("Frozen input mismatch");
const observations = await json("observations.json"), checks = await json("checks.json"), gold = await json("gold.json"), review = await json("review.json");
const source = resolve("results/process-v1/signal-memory");
if (contentHash(await readFile(resolve(source, "solution-plan.json"), "utf8")) !== observations.source_plan_sha256) throw new Error("Original plan changed");
for (const [name, hash] of Object.entries(observations.game_hashes)) if (contentHash(await readFile(resolve(source, "game", name), "utf8")) !== hash) throw new Error(`Generated ${name} changed`);
const receipt = await json("receipt.json");
if (receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(await readFile(resolve(root, "prompt.txt"), "utf8")) || review.model !== "hy3") throw new Error("Invalid Hy3 receipt");
if (checks.checks.length !== 12 || observations.trials.length !== 12) throw new Error("Expected three contexts times four modes");
for (const [index, trial] of observations.trials.entries()) {
  const check = checks.checks[index];
  if (trial.repeat !== check.repeat || trial.mode !== check.mode || trial.immediate.observation.state.phase !== "menu" ||
    check.immediate_menu !== true || check.delayed_menu !== (trial.delayed.observation.state.phase === "menu" && trial.delayed.events.every((e: any) => e.type === "game_reset"))) throw new Error(`Raw observation disagrees with check ${index}`);
}
const active = checks.checks.filter((c: any) => c.mode !== "idle"), idle = checks.checks.filter((c: any) => c.mode === "idle");
const immediatePasses = active.filter((c: any) => c.immediate_menu).length, delayedPasses = active.filter((c: any) => c.delayed_menu).length;
if (active.length !== 9 || idle.length !== 3 || !idle.every((c: any) => c.delayed_menu) || gold.has_error !== (delayedPasses < active.length) ||
  gold.first_error_step !== (gold.has_error ? 5 : null)) throw new Error("Gold not supported by frozen experimental checks");
const summary = { unit: "one original Hy3 game, one selected plan step, three browser contexts", step_id: 5,
  immediate_passes: immediatePasses, immediate_trials: active.length, delayed_passes: delayedPasses, delayed_trials: active.length,
  idle_control_passes: idle.filter((c: any) => c.delayed_menu).length, idle_control_trials: idle.length,
  gold: { has_error: gold.has_error, first_error_step: gold.first_error_step, error_type: gold.error_type },
  hy3: { has_error: review.has_error, first_error_step: review.first_error_step, error_type: review.error_type, explanation: review.explanation },
  detected: review.has_error === gold.has_error, localized: review.first_error_step === gold.first_error_step,
  type_match: review.error_type === gold.error_type, code_provenance: observations.code_provenance,
  scope_warning: "A passed immediate reset check is not a correct complete game result. The original full-plan earliest contradiction remains step 2." };
await writeFile(resolve(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(root, "REPORT.md"), ["# Signal Memory：即时重开通过，延时菜单失效", "",
  `同一原始 Hy3 游戏，在播放期间用 Restart 按钮或 KeyR 重开。即时菜单检查 ${immediatePasses}/${active.length} 通过；虚拟时间再推进 1600ms 后 ${delayedPasses}/${active.length} 通过。无播放重置对照 ${summary.idle_control_passes}/${idle.length} 通过。三个浏览器上下文用于复现，不是九份独立游戏。`, "",
  "延时观察中外层 status 仍是 menu，但 state.phase 变为 input，重置后的事件表又出现 input_phase_started。原方案第 5 步明确要求重开后 phase='menu'；这条主张受到直接反例。原游戏文件未修改。", "",
  `冻结标准：错误第 ${gold.first_error_step} 步，类别 ${gold.error_type}。Hy3 判断：${review.has_error === true ? "有错" : review.has_error === false ? "无错" : "未知"}，首错第 ${review.first_error_step ?? "—"} 步，类别 ${review.error_type}。本案例检出 ${summary.detected ? "命中" : "未命中"}、步骤定位 ${summary.localized ? "命中" : "未命中"}；只有一条过程主张，不据此估计总体准确率。`, "",
  "即时检查通过只是一项局部结果，不等于整款游戏最终答案正确。按原方案全前缀计，已有第 2 步更早的断言反例；本报告单独诊断第 5 步的异步边界。代码摘录来源可由 Write/Edit 重建定位，但来源编号不替代方案步骤编号。", "",
  "原方案、生成文件、实验输入、模型提示及收据均由报告脚本核对哈希。原始状态与事件见 observations.json，确定性检查见 checks.json。", ""
].join("\n"));
console.log(JSON.stringify({ immediate_passes: immediatePasses, delayed_passes: delayedPasses, gold, hy3: summary.hy3 }));
