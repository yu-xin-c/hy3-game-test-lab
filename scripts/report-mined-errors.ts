import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";

const root = resolve("results/error-mining-v1");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const summary = await json(resolve(root, "summary.json"));
const rows: any[] = [];
for (const finding of summary.findings) {
  let review = null;
  try { review = await json(resolve(root, finding.id + "-full-review.json")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (review) {
    const dir = resolve(root, finding.id + "-full-review-call");
    const receipt = await json(resolve(dir, "receipt.json"));
    const prompt = await readFile(resolve(dir, "prompt.txt"), "utf8");
    if (receipt.model !== "hy3" || !receipt.model_verified || contentHash(prompt) !== receipt.prompt_sha256) throw new Error("Invalid review receipt");
    try { const raw = await readFile(resolve(dir, "response.raw.jsonl"), "utf8"); if (contentHash(raw) !== receipt.response_sha256) throw new Error("Response hash mismatch"); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; /* raw provider envelopes are local-only */ }
  }
  const provenance = review?.code_provenance;
  rows.push({ id: finding.id, difficulty: finding.difficulty,
    reproduced: finding.runs.filter((r: any) => r.reproduced).length, repetitions: finding.runs.length,
    model_supports_defect: review?.verdict.defect_supported ?? null,
    predicted_first_observed_action: review?.verdict.first_observed_action ?? null,
    code_provenance: provenance ?? null,
    final_observation: finding.runs[0].trace.at(-1),
    source: relative(root, finding.source), limits: review?.verdict.limits ?? [] });
}

await writeFile(resolve(root, "review-summary.json"), JSON.stringify({ rows,
  review_count: rows.filter(r => r.model_supports_defect !== null).length,
  note: "Reproduction and byte-matched provenance are not causal proof. Historical samples lack numbered public plans."
}, null, 2));
const lines = ["# 真实错误复验与混元定位", "",
  `已扫描 ${summary.scanned_games} 个游戏，筛出 ${summary.historical_candidates} 个历史疑似错误场景。首批复验 ${rows.length} 个游戏，共 ${summary.browser_runs} 次运行。`, "",
  "| 游戏 | 难度 | 复现次数 | Hy3 支持缺陷 | 代码引用起始行 | 实际写入步骤 |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.difficulty} | ${r.reproduced}/${r.repetitions} | ${r.model_supports_defect === null ? "待完成" : r.model_supports_defect ? "是" : "否"} | ${r.code_provenance ? r.code_provenance.file + ":" + r.code_provenance.line : "未匹配"} | ${r.code_provenance?.contributing_tool_steps.join(", ") ?? "未匹配"} |`), "",
  "写入步骤来自真实工具日志回放，不是模型猜测；引用起始行不等于最小错误行。历史代码没有编号公开方案，不能把写入步骤当作首个推理错误步骤。", "",
  "## 检查范围", "",
  "原始生成代码保持不变。按公开需求选择输入，每步推进 100ms，最后等待 1000ms；在三个独立 Chromium 上下文中复验。混元仅收到题面、代码与原始观测，没有收到候选类别或预选代码位置。", "",
  "初次复核漏发公共接口规范，导致 Science Circuit 的局内 Restart 要求未进入评审上下文。初次记录保留为 *-review.json，但不计入上表；上表仅使用补齐原始公开生成提示的 *-full-review.json。不能把这个输入缺陷当作模型误报率或漏报率。", "",
  "## 最小改动对照", "",
  "另执行 12 次真实浏览器对照，仅在诊断浏览器返回的 game.js 中做局部替换，不修改原始文件。Particle Orchestra 移除额外 +100 后，三次均从 200 分恢复为 100 分，仍然获胜；Zen Garden 在错误处理后更新 HUD，三次均从 Playing 恢复为 Lost，失败逻辑不变。详见 causal-checks/result.json。这支持所定位代码与现象的联系，不代表已经证明其他行为全部正确，也不作为新的 Hy3 生成成绩。", "",
  "禅意庭院的终局 state.status=lost 可以通过简单的终局状态测试，但 HUD 仍显示 Playing。这属于局部检查通过而完整功能存在缺陷，不能把整个最终答案称为正确。", "",
  "## 判定边界", "",
  "Particle Orchestra 的题面‘获胜并得到100分’存在总分/额外奖励歧义，混元前后判断不一致。虽然额外加分机制已被对照验证，但这不能自动证明违反需求；该例保留为歧义候选，不纳入确定错误标准集，也不事后修改原题面来使模型成为错误。", "",
  ...rows.flatMap(r => [`### ${r.id}`, "", `首个可观测动作（Hy3）：${r.predicted_first_observed_action ?? "待确认"}。`, "", ...r.limits.map((l: string) => `- ${l}`), ""])
];
await writeFile(resolve(root, "REPORT.md"), lines.join("\n"));
console.log(JSON.stringify({ reviewed: rows.filter(r => r.model_supports_defect !== null).length, rows: rows.length }));
