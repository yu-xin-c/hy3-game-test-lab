import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { verifierMetrics } from "../src/evaluation/verifier-metrics";
const root = resolve("results/verifier-v1");
const text = await readFile(resolve(root, "cases.json"), "utf8");
if (contentHash(text) !== await readFile(resolve(root, "cases.sha256"), "utf8")) throw new Error("Frozen standard changed");
const rows: any[] = [];
for (const c of JSON.parse(text).cases) {
  let review = null;
  try { review = JSON.parse(await readFile(resolve(root, c.id + "-review.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (review) {
    const receipt = JSON.parse(await readFile(resolve(root, c.id + "-call/receipt.json"), "utf8"));
    if (receipt.model !== "hy3" || !receipt.model_verified || contentHash(await readFile(resolve(root, c.id + "-call/prompt.txt"), "utf8")) !== receipt.prompt_sha256) throw new Error("Invalid Hy3 receipt");
  }
  rows.push({ id: c.id, origin_game: c.origin_game, diagnostic_control: c.diagnostic_control, gold: c.gold, review, repeats: c.runs.length });
}
const metrics = verifierMetrics(rows), complete = metrics.complete;
const summary = { scope: "two public requirements, four code versions; not whole-game or reasoning accuracy", ...metrics, rows,
  repeated_browser_runs: rows.reduce((n, r) => n + r.repeats, 0) };
await writeFile(resolve(root, "summary.json"), JSON.stringify(summary, null, 2));
const rate = (m: { numerator: number; denominator: number; rate: number | null }) => `${m.numerator}/${m.denominator}` + (m.rate === null ? "（本轮未汇总）" : `（${(m.rate * 100).toFixed(1)}%）`);
await writeFile(resolve(root, "REPORT.md"), ["# Hy3 自动评估器验证", "",
  `进度：${rows.filter(r => r.review).length}/${rows.length} 个评审完成；${summary.repeated_browser_runs} 次独立 Chromium 执行。`, "",
  "只验证两条明确公开要求：错误操作后HUD胜负状态同步、局内Restart可见可用并重置。使用两个既有Hy3游戏及其局部修正诊断对照；不将修正版本算作新生成游戏。对照合格只针对目标要求，不声称整个游戏没有缺陷。", "",
  "标准在评审前由真实浏览器确定性断言生成并冻结哈希。每例三次一致；三次重放不扩大独立样本数。Hy3不接收原始/修正标签、补丁、标准结果及标准位置。", "",
  "| ID | 来源 | 标准缺陷 | 标准首错操作 | Hy3缺陷 | Hy3首错操作 |", "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.origin_game} | ${r.gold.defect} | ${r.gold.first_error_index ?? "无"} | ${r.review?.verdict.defect ?? "待返回"} | ${r.review?.verdict.first_error_index ?? "无"} |`), "",
  `缺陷检出：${rate(summary.detection)}。`, `可观测操作首错准确率：${rate(summary.observed_step_localization)}。`, `目标要求正常对照上的误报率：${rate(summary.false_positive_rate)}。`, "",
  "这里的首错是游戏执行操作，不是模型内部推理步骤；代码引用另保存在逐例review文件中。该验证只支持当前四个实现、两条要求上的结论，不能推断未知游戏的总体定位率。", "",
  "复现：validate-hy3-verifier.ts 执行并冻结，追加 --judge --cli 路径进行Hy3评审，report-verifier-validation.ts 汇总。实验方案见 experiments/verifier-v1；没有生成模拟结果。"
].join("\n"));
console.log(JSON.stringify({ complete, detection: summary.detection, localization: summary.observed_step_localization, fpr: summary.false_positive_rate }));
