import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(root, "results/checking-policy-v2");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const hashFile = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const summaries = [];
for (const id of ["target-rush", "key-door-escape", "mini-farm", "science-lab"]) {
  const original = await readJson(resolve(root, `results/codebuddy-hy3-pilot/evidence/${id}/result.json`));
  const current = await readJson(resolve(output, id, "result.json"));
  if (current.evaluation_context !== "retrospective_diagnostic") throw new Error("Expected retrospective run");
  if (original.input_hashes.game_directory_sha256 !== current.input_hashes.game_directory_sha256) {
    throw new Error(`Generated game changed: ${id}`);
  }
  for (const [field, path] of [
    ["runner_sha256", "src/runtime/playthrough.ts"], ["evaluator_sha256", "src/evaluation/evaluator.ts"],
    ["test_plan_sha256", `datasets/game-tasks/${id}/test-plan.json`],
    ["oracle_sha256", `datasets/game-tasks/${id}/oracle.private.json`]
  ]) {
    if (current.input_hashes[field!] !== await hashFile(resolve(root, path!))) throw new Error(`Run/source mismatch: ${id}/${field}`);
  }
  const oldIds = new Set(original.scenarios.map((s: any) => s.scenario_id));
  const common = current.scenarios.filter((s: any) => oldIds.has(s.scenario_id));
  const added = current.scenarios.filter((s: any) => !oldIds.has(s.scenario_id));
  summaries.push({ task_id: id, game_sha256: current.input_hashes.game_directory_sha256,
    old_process_passes: original.aggregate.process_passes, old_runs: original.scenarios.length,
    revised_common_process_passes: common.filter((s: any) => s.evaluation.process_correct).length,
    revised_common_runs: common.length,
    additional_runs: added.length, additional_failures: added.filter((s: any) => !s.evaluation.process_correct).length,
    source_result: `${id}/result.json` });
}
await writeFile(resolve(output, "summary.json"), JSON.stringify({
  evaluation_context: "retrospective_diagnostic", checking_policy_version: "2026-09-12.3",
  generated_games_modified: false, tasks: summaries
}, null, 2) + "\n");
const lines = [
  "# 新版检查规则复核", "",
  "对四款原始 Hy3 游戏重新试玩，游戏文件未修改。共 45 次路径执行，每条路径重放 3 遍。新旧题面、时间预算和 UI 检查范围不同，这不是正式模型分数，也不能解释为模型能力提升。", "",
  "| 游戏 | 旧规则过程通过 | 新规则同名路径通过 | 新增负向路径 |",
  "| --- | ---: | ---: | --- |",
  ...summaries.map(s => `| [${s.task_id}](${s.source_result}) | ${s.old_process_passes}/${s.old_runs} | ${s.revised_common_process_passes}/${s.revised_common_runs} | ${s.additional_runs ? `${s.additional_failures}/${s.additional_runs} 次检出违例` : "—"} |`),
  "", "通过指该条路径的检查符合预期，包含主动失败、超时和重开；不是游戏通关率。", "",
  "- 钥匙迷宫的隐藏文案格式检查已移除；新规则的 UI 基础检查通过，不代表所有分数含义或画面质量已经认证。",
  "- 农场通关、超时路径正常；局内 Restart 仍不可点击。新题面明确要求局内重开，旧模型生成时未收到这一新增表述，因此这里只记录差异。",
  "- 科学实验正常流程、过热和重开通过；未混合、未经历 60°C 就装瓶的两条路径仍错误获胜，各复现三次。新增路径在观察首批结果后设计，不冒充预先冻结测试。",
  "- 打靶超时检查稳定；目标不可见依旧导致通关和重开路径中断。", "",
  "## 检查规则", "",
  "每条路径补上 L1 启动检查。事件可检查当前操作或上个检查点以来的区间，重开/刷新会清空区间。终局状态先记录，再明确推进 32ms 检查画面。农场与科学实验计时段、打靶超时段增加 32ms 余量；农场计时容差 32ms，科学实验温度容差 0.64°C；金币、生命、胜负仍精确比较。", "",
  "L3 基础检查只保证状态文字、非空 HUD 和可见性，不声称覆盖分数语义与多模态视觉质量。104 项单元/DOM 测试和 21 项 Chromium 测试通过；96 题重复构建的输入完全相同。", "",
  "## 复跑", "", "在仓库根目录运行：", "", "```bash",
  "pnpm run eval:task -- --task science-lab --game-dir results/codebuddy-hy3-pilot/evidence/science-lab/game --context retrospective_diagnostic --replays 3",
  "```", "",
  "复跑旧规则时额外指定 `--task-dir results/codebuddy-hy3-pilot/evidence/science-lab/task`。运行前验证冻结输入哈希，结果记录实际规则、评测器、运行器和游戏哈希。",
  "", "后续96题批次已完成，去重汇总见 results/consolidated。此处仅保留早期规则诊断，不能作为全量运行状态。"
];
await writeFile(resolve(output, "README.md"), lines.join("\n") + "\n");
console.log("Verified unchanged game hashes and wrote four-game rule review.");
