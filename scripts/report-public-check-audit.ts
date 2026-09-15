import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { validateAuditReview } from "../src/evaluation/oracle-audit";

const index = process.argv.indexOf("--root");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --root AUDIT_DIRECTORY");
const root = resolve(process.argv[index + 1]!);
const inventoryText = await readFile(resolve(root, "inventory.json"), "utf8");
const hashRecord = (await readFile(resolve(root, "inventory.sha256"), "utf8")).trim();
if (hashRecord !== contentHash(inventoryText) + "  inventory.json") throw new Error("Inventory hash mismatch");
const inventory = JSON.parse(inventoryText);
const rows = [], issues = [];
let covered = 0;
const counts: Record<string, number> = { supported: 0, unsupported: 0, ambiguous: 0, test_mechanics: 0 };
for (const packet of inventory) {
  const dir = resolve(root, packet.task_id);
  let result;
  try { result = JSON.parse(await readFile(resolve(dir, "review.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
  if (result.model !== "hy3") throw new Error("Non-Hy3 audit output");
  const review = validateAuditReview(result.review, packet.assertions, packet.publicText);
  const receiptPairs = [["prompt.txt", "receipt.json"], ...(result.quote_repair_applied ? [["repair-prompt.txt", "repair-receipt.json"]] : []), ...(result.line_repair_applied ? [["line-prompt.txt", "line-receipt.json"]] : [])];
  for (const pair of receiptPairs) {
    const prompt = await readFile(resolve(dir, pair[0]!), "utf8");
    const receipt = JSON.parse(await readFile(resolve(dir, pair[1]!), "utf8"));
    if (!receipt.model_verified || receipt.model !== "hy3" || receipt.prompt_sha256 !== contentHash(prompt)) throw new Error(`${packet.task_id}: invalid receipt`);
    if (pair[0] === "prompt.txt" && result.prompt_sha256 !== receipt.prompt_sha256) throw new Error("Review/receipt mismatch");
  }
  const taskCounts = { supported: 0, unsupported: 0, ambiguous: 0, test_mechanics: 0 };
  for (const decision of review.assertions) {
    counts[decision.verdict]!++;
    taskCounts[decision.verdict]++;
    if (["unsupported", "ambiguous"].includes(decision.verdict)) issues.push({ task_id: packet.task_id,
      assertion: packet.assertions.find((a: any) => a.id === decision.id), decision,
      status: "model_flag_only_not_confirmed_standard_error" });
  }
  covered += review.assertions.length;
  rows.push({ task_id: packet.task_id, predicates: review.assertions.length, quote_repair_applied: result.quote_repair_applied === true || result.line_repair_applied === true, counts: taskCounts });
}
const total = inventory.reduce((n: number, p: any) => n + p.assertions.length, 0);
const summary = { scope: "Source-grounded model audit, not gameplay accuracy or independently validated oracle quality", inventory_sha256: contentHash(inventoryText),
  total_tasks: inventory.length, reviewed_tasks: rows.length, total_predicates: total, reviewed_predicates: covered,
  remaining_tasks: inventory.length - rows.length, remaining_predicates: total - covered, model_labels: counts, rows };
await writeFile(resolve(root, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(resolve(root, "flagged-checks.json"), JSON.stringify({ scope: summary.scope, issues }, null, 2));
await writeFile(resolve(root, "SUMMARY.md"), ["# 判据核对快照", "",
  `已核对 ${rows.length}/${inventory.length} 题、${covered}/${total} 个去重检查项；其余 ${inventory.length - rows.length} 题没有完整且凭据有效的核对结果。此文件反映已保存产物，不判断后台进程是否运行。`, "",
  "| 题目 | 检查项 | 有依据（模型） | 缺依据（模型） | 歧义（模型） | 执行约定 | 引用纠正 |", "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ...rows.map(r => `| [${r.task_id}](${r.task_id}/review.json) | ${r.predicates} | ${r.counts.supported} | ${r.counts.unsupported} | ${r.counts.ambiguous} | ${r.counts.test_mechanics} | ${r.quote_repair_applied ? "有，原输出保留" : "无"} |`), "",
  "模型标记的问题保存在 flagged-checks.json，包含原始取值、全部场景位置、模型理由和引文。这里的‘有依据’也不是独立认证；例如 target-rush A31 用真实引文推出未规定的终局编号，不能直接采纳，说明见 README。没有自动修改标准或评测成绩。", "",
  "复现：pnpm exec tsx scripts/report-public-check-audit.ts --root results/public-check-audit-v1", ""
].join("\n"));
console.log(JSON.stringify({ reviewed_tasks: rows.length, reviewed_predicates: covered, model_labels: counts }));
