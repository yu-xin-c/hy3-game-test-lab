import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { ProcessReview } from "../src/contracts/process-review";
const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index + 1]) throw new Error("Missing --out");
const root = resolve(process.argv[index + 1]!);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const manifest = await json(resolve(root, "manifest.json"));
const rows: any[] = [], incomplete: any[] = [];
for (const id of manifest.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error("Invalid ID");
  const dir = resolve(root, id), status = await json(resolve(dir, "status.json"));
  if (status.stage !== "complete") { incomplete.push({ id, stage: status.stage }); continue; }
  const result = await json(resolve(dir, "browser/result.json"));
  let bundle = "";
  for (const name of (await readdir(resolve(dir, "game"))).sort((a, b) => a.localeCompare(b))) bundle += name + "\0" + await readFile(resolve(dir, "game", name), "utf8") + "\0";
  if (contentHash(bundle) !== result.input_hashes.game_directory_sha256) throw new Error(`Changed game: ${id}`);
  for (const call of ["plan-call", "generation-call", "review-call"]) {
    const receipt = await json(resolve(dir, call, "receipt.json"));
    if (receipt.model !== "hy3" || !receipt.model_verified || contentHash(await readFile(resolve(dir, call, "prompt.txt"), "utf8")) !== receipt.prompt_sha256) throw new Error("Invalid model receipt");
  }
  const model = ProcessReview.parse((await json(resolve(dir, "review.json"))).verdict);
  const task = await json(resolve(dir, "task/test-plan.json"));
  const provenance = await json(resolve(dir, "generation-provenance.json"));
  rows.push({ id, difficulty: task.difficulty, model, provenance_complete: provenance.complete, browser_runs: result.scenarios.length });
}
const counts = (group: any[]) => ({ samples: group.length, final_correct: group.filter(r => r.model.final_correct === true).length,
  final_known: group.filter(r => r.model.final_correct !== null).length, process_correct: group.filter(r => r.model.process_correct === true).length,
  process_known: group.filter(r => r.model.process_correct !== null).length });
const errors: Record<string, number> = {};
for (const row of rows) for (const f of row.model.findings) if (f.status === "supported_defect") errors[f.kind] = (errors[f.kind] ?? 0) + 1;
const summary = { tasks: rows.length, planned_tasks: manifest.tasks.length, incomplete, model: "hy3", browser_runs: rows.reduce((n, r) => n + r.browser_runs, 0),
  counts: counts(rows), by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(d => [d, counts(rows.filter(r => r.difficulty.level === d))])), errors, rows };
await writeFile(resolve(root, "summary.json"), JSON.stringify(summary, null, 2));
const label = (v: boolean | null) => v === null ? "证据不足" : v ? "正确" : "有问题";
const lines = ["# 游戏生成过程评估", "", `${rows.length}/${manifest.tasks.length} 题完成 Hy3 生成、真实 Chromium 执行与 Hy3 复核，共 ${summary.browser_runs} 次路径重放。`, "",
  "生成前输出编号公开方案，生成时记录 Write/Edit，运行后按需求、代码及状态证据复核。私有检查不进入生成提示，代码和调用提示均核对哈希。", "",
  "| 游戏 | 难度 | 最终功能（Hy3） | 过程（Hy3） | 首错方案步骤 | 代码历史 |", "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.difficulty.level} | ${label(r.model.final_correct)} | ${label(r.model.process_correct)} | ${r.model.first_error_step ?? "未确定"} | ${r.provenance_complete ? "重建一致" : "不完整"} |`), "",
  "| 难度 | 样本数 | 最终正确/可判定 | 过程正确/可判定 |", "| --- | --- | --- | --- |",
  ...Object.entries(summary.by_difficulty).map(([d, c]) => `| ${d} | ${c.samples} | ${c.final_correct}/${c.final_known} | ${c.process_correct}/${c.process_known} |`), "",
  "这是模型复核意见，不是独立标准答案。样本少且存在不可判定项，不能推断能力下降的临界难度。错误类型条目数：" + JSON.stringify(errors), "",
  ...rows.flatMap(r => [`## ${r.id}`, "", r.difficulty.rationale, "", ...r.model.findings.map((f: any) => `- ${f.kind} / ${f.status}：${f.explanation}`), "", ...r.model.limits.map((l: string) => `- 限制：${l}`), ""]),
  "## 自动验证与边界", "", "操作首错、代码写入步骤与方案首错是三个不同位置。精确匹配证明代码来源，不独立证明推理首错。规则失败也可能来自测试时机或未公开的字段约束。", "",
  "平台游戏另有 6 次同代码对照：立即起跳 0/3 通关，确认落地后起跳 3/3 通关。结果位于 platform-rescue/landing-timing-diagnostic；独立错误及局部干预见 [错误定位报告](../error-mining-v1/REPORT.md)。这些对照不替换原始成绩。", "",
  "运行：pnpm run app。复跑：pnpm run run:process -- --out 新目录 --cli CodeBuddy路径。"
];
await writeFile(resolve(root, "REPORT.md"), lines.join("\n"));
console.log(JSON.stringify({ tasks: rows.length, browser_runs: summary.browser_runs, counts: summary.counts }));
