import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";

const at = process.argv.indexOf("--out");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[at + 1]!);
const sources = [
  { game: "target-rush", difficulty: "D1", root: resolve("results/plan-claims-target-full-v1"), id: "target-rush-prefix-6", files: ["observations.json", "checks.json", "packets.json", "gold.json"], category: null },
  { game: "platform-rescue", difficulty: "D2", root: resolve("results/plan-claims-v3"), id: "platform-rescue-prefix-2", files: ["observations.json", "packets.json", "gold.json"], category: "预设输入时机不成立" },
  { game: "signal-memory", difficulty: "D3", root: resolve("results/plan-claims-v1"), id: "prefix-2", files: ["observations.json", "packets.json", "gold.json"], category: "验证断言误述重置状态" }
] as const;
const rows: { game: string; difficulty: string; selected_steps: number; standard_has_issue: boolean | null; standard_first_issue_step: number | null; hy3_has_issue: boolean | null; hy3_first_issue_step: number | null; descriptive_error_type: string | null; evidence: string; review: string }[] = [];
for (const s of sources) {
  const actual = (await Promise.all(s.files.map(async name => `${contentHash(await readFile(resolve(s.root, name), "utf8"))}  ${name}`))).join("\n") + "\n";
  if (actual !== await readFile(resolve(s.root, "input-sha256.txt"), "utf8")) throw new Error(`${s.game}: frozen evidence mismatch`);
  const gold = JSON.parse(await readFile(resolve(s.root, "gold.json"), "utf8"));
  const expected = Array.isArray(gold) ? gold.find((g: any) => g.id === s.id) : gold.gold.find((g: any) => g.id === s.id);
  if (!expected) throw new Error(`${s.game}: missing gold`);
  const published = resolve(s.root, s.id);
  const review = JSON.parse(await readFile(resolve(published, "review.json"), "utf8"));
  const receipt = JSON.parse(await readFile(resolve(published, "receipt.json"), "utf8"));
  const prompt = await readFile(resolve(published, "prompt.txt"), "utf8");
  if (review.model !== "hy3" || receipt.model !== "hy3" || receipt.model_verified !== true || receipt.prompt_sha256 !== contentHash(prompt)) throw new Error(`${s.game}: invalid Hy3 receipt`);
  if (![true, false, null].includes(review.has_error) || ![true, false, null].includes(expected.has_error)) throw new Error(`${s.game}: malformed verdict`);
  const stepCount = Number(s.id.split("-prefix-")[1] ?? s.id.split("prefix-")[1]);
  rows.push({ game: s.game, difficulty: s.difficulty, selected_steps: stepCount,
    standard_has_issue: expected.has_error, standard_first_issue_step: expected.first_error_step,
    hy3_has_issue: review.has_error, hy3_first_issue_step: review.first_error_step,
    descriptive_error_type: s.category, evidence: `${relative(resolve("."), s.root)}/README.md`, review: `${relative(resolve("."), published)}/review.json` });
}
const bad = rows.filter(r => r.standard_has_issue === true), clean = rows.filter(r => r.standard_has_issue === false);
const summary = { scope: "Post-hoc synthesis of selected executable public-plan verification assertions; each original Hy3 game counted once. Not complete reasoning or final gameplay correctness.",
  games: rows.length, wrong_plan_claims: bad.length, clean_selected_claims: clean.length,
  detected: bad.filter(r => r.hy3_has_issue === true).length,
  located: bad.filter(r => r.hy3_has_issue === true && r.hy3_first_issue_step === r.standard_first_issue_step).length,
  clean_false_positive: clean.filter(r => r.hy3_has_issue === true).length,
  model_unknown: rows.filter(r => r.hy3_has_issue === null).length,
  selected_claim_process_valid: clean.length,
  descriptive_error_type_distribution: Object.fromEntries([...new Set(bad.map(r => r.descriptive_error_type))].map(k => [k, bad.filter(r => r.descriptive_error_type === k).length])),
  by_difficulty: Object.fromEntries(["D1", "D2", "D3"].map(d => [d, rows.filter(r => r.difficulty === d)])), rows };
await mkdir(out, { recursive: false });
await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(resolve(out, "REPORT.md"), ["# 三款游戏的公开方案断言核验", "",
  "每款原始 Hy3 游戏只取已保存的最长可执行断言前缀；这是完成后做的描述性汇总，不是盲选独立测试集。", "",
  "| 游戏 | 难度 | 已测方案步数 | 执行判据首错 | 混元首错 |", "| --- | --- | ---: | ---: | ---: |",
  ...rows.map(r => `| ${r.game} | ${r.difficulty} | ${r.selected_steps} | ${r.standard_first_issue_step ?? "无"} | ${r.hy3_first_issue_step ?? "无"} |`), "",
  `两份有错误断言的方案均被混元检出并定位到对应步骤（${summary.located}/${bad.length}）；一份所选断言正常方案未被误报（${summary.clean_false_positive}/${clean.length}）。这三个单位是游戏，不把相关前缀或重复运行扩成更多样本。`, "",
  `所选方案断言成立 ${clean.length}/${rows.length}。两个错误类型来自独立执行证据的事后描述：平台题为预设输入时机不成立，记忆题为验证断言误述重置状态。没有以此计算错误类型分类准确率。`, "",
  "D1/D2/D3 各一款，步骤覆盖又不同，不能判断难度临界点。Target Rush 六步只核验被实际执行的 verification，部分 implementation 细节未测；另两款仅到第二步。这个比例也不是游戏最终答案准确率或完整生成推理正确率。", "",
  "平台游戏基于 grounded 调整输入后有三次通关重放，说明原方案固定路径失败并不足以判定整款游戏不可玩。Signal Memory 的菜单重置序列断言错误不等于公开需求要求在菜单加载序列。", "",
  "证据：各来源目录的冻结输入哈希、浏览器观测、标准及 Hy3 提示/凭据；本脚本重新核对它们后才写汇总。"
].join("\n"));
console.log(JSON.stringify({ games: rows.length, located: summary.located, bad: bad.length, false_positive: summary.clean_false_positive, clean: clean.length }));
