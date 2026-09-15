import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
const i = process.argv.indexOf("--root");
if (i < 0 || !process.argv[i + 1]) throw new Error("Provide --root");
const root = resolve(process.argv[i + 1]!);
let isolated = false;
try {
  const condition = JSON.parse(await readFile(resolve(root, "condition.json"), "utf8"));
  isolated = condition.condition === "prefix_evidence_isolated";
  if (isolated) {
    const baseline = resolve(root, condition.baseline);
    for (const name of ["observations.json", "gold.json"]) {
      if (await readFile(resolve(root, name), "utf8") !== await readFile(resolve(baseline, name), "utf8")) throw new Error("Isolation experiment changed observations or gold");
    }
    if (contentHash(await readFile(resolve(baseline, "input-sha256.txt"), "utf8")) !== condition.source_input_sha256) throw new Error("Baseline input hash mismatch");
  }
}
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const names = ["observations.json", "packets.json", "gold.json"];
const hashRecord = async (list: string[]) => (await Promise.all(list.map(async name => `${contentHash(await readFile(resolve(root, name), "utf8"))}  ${name}`))).join("\n") + "\n";
let hashes = await hashRecord(names);
try { hashes = await hashRecord(["observations.json", "checks.json", "packets.json", "gold.json"]); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (hashes !== await readFile(resolve(root, "input-sha256.txt"), "utf8")) throw new Error("Frozen input mismatch");
const gold = JSON.parse(await readFile(resolve(root, "gold.json"), "utf8"));
const rows = [];
for (const expected of gold) {
  const dir = resolve(root, expected.id);
  const review = JSON.parse(await readFile(resolve(dir, "review.json"), "utf8"));
  const receipt = JSON.parse(await readFile(resolve(dir, "receipt.json"), "utf8"));
  const prompt = await readFile(resolve(dir, "prompt.txt"), "utf8");
  if (review.model !== "hy3" || receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(prompt)) throw new Error("Invalid model receipt");
  if (![true, false, null].includes(review.has_error) || (review.first_error_step !== null && !Number.isInteger(review.first_error_step))) throw new Error("Malformed review");
  rows.push({ id: expected.id, expected, review });
}
const wrong = rows.filter(r => r.expected.has_error === true);
const normal = rows.filter(r => r.expected.has_error === false);
const games = [...new Set(rows.map(r => r.id.split("-prefix-")[0]))];
const targetFull = games.length === 1 && games[0] === "target-rush" && rows.every(r => Number(r.id.split("-prefix-")[1]) >= 3);
const summary = { scope: "Selected verification assertions only; related prefixes, not independent full plans", condition: isolated ? "prefix_evidence_isolated" : targetFull ? "target_full_selected_claims" : "original_v2", games, total_prefixes: rows.length,
  errors: wrong.length, detected: wrong.filter(r => r.review.has_error === true).length,
  localized: wrong.filter(r => r.review.has_error === true && r.review.first_error_step === r.expected.first_error_step).length,
  normal: normal.length, false_positives: normal.filter(r => r.review.has_error === true).length,
  normal_unknown: normal.filter(r => r.review.has_error === null).length,
  model_unknown: rows.filter(r => r.review.has_error === null).length, gold_unknown: rows.filter(r => r.expected.has_error === null).length,
  rows };
await writeFile(resolve(root, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(resolve(root, "SUMMARY.md"), ["# 原方案断言核验结果", "",
  `${rows.length} 个前缀的模型输出和输入凭据均已核验。${summary.errors ? `错误前缀定位 ${summary.localized}/${summary.errors}` : "本轮没有错误前缀，不能计算定位准确率"}；指定断言正常前缀误报 ${summary.false_positives}/${summary.normal}，其中 ${summary.normal_unknown} 个正常前缀回答未知，不能算作正确通过；模型未知合计 ${summary.model_unknown}，标准未知 ${summary.gold_unknown}。`, "",
  "| 原方案前缀 | 执行标准：有错 | 标准首错 | Hy3：有错 | Hy3 首错 |", "| --- | --- | --- | --- | --- |",
  ...rows.map(r => `| ${r.id} | ${r.expected.has_error} | ${r.expected.first_error_step ?? "—"} | ${r.review.has_error} | ${r.review.first_error_step ?? "—"} |`), "",
  `这些计数只评价结构化判断及所选 verification 断言，不能认证整个解释、完整方案或全部玩法。涉及 ${games.length} 款游戏、${rows.length} 个相关前缀；重复运行不扩大模型分母。`, "",
  isolated ? "本轮仅隔离单步输入，原始观测和标准与 v2 字节一致。新旧标签差异不能单独证明因果改善：这是事后诊断，且未通过多轮模型重复排除随机性。原始 v2 输出保留。" : targetFull ? "本轮新增同一原方案步骤 3–6 的浏览器检查，步骤 1–2 沿用旧标准。所选断言通过不等于全部 implementation 主张成立；范围边界见 README。" : "解释存在范围问题：两个 prefix-1 的回复都评价了未提供的步骤 2；platform-rescue-prefix-1 因此回答未知，尽管解释承认步骤 1 的观测一致。输入的范围说明和观测包含后续检查信息，可能干扰了模型；原输出保留，不能把标签命中当作解释完全成立。今后若收窄输入，需另开版本，不替换本次结果。",
  ...(targetFull ? [] : ["", "平台原方案验证路径失败，不代表最终游戏无法通关；根据 grounded 调整输入的路径曾成功。规则修订与原始观测的边界见 README。"])
].join("\n") + "\n");
console.log(JSON.stringify({ localized: summary.localized, errors: summary.errors, false_positives: summary.false_positives, normal: summary.normal, model_unknown: summary.model_unknown }));
