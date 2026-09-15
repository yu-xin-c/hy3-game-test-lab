import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "../src/evaluation/generation-provenance";
import { validateAuditReview } from "../src/evaluation/oracle-audit";

const at = process.argv.indexOf("--root");
if (at < 0 || !process.argv[at + 1]) throw new Error("Provide --root AUDIT_DIRECTORY");
const root = resolve(process.argv[at + 1]!);
const inventoryText = await readFile(resolve(root, "inventory.json"), "utf8");
if ((await readFile(resolve(root, "inventory.sha256"), "utf8")).trim() !== contentHash(inventoryText) + "  inventory.json") throw new Error("Inventory hash mismatch");
const inventory = JSON.parse(inventoryText);
const scope = JSON.parse(await readFile(resolve(root, "scope.json"), "utf8"));
if (scope.selection !== "first_n_in_frozen_inventory" || scope.task_limit !== 15) throw new Error("This gate is scoped to the formal first 15 tasks");
const risks: any[] = [];
for (const packet of inventory.slice(0, 15)) {
  const saved = JSON.parse(await readFile(resolve(root, packet.task_id, "review.json"), "utf8"));
  if (saved.model !== "hy3") throw new Error(`Non-Hy3 source audit: ${packet.task_id}`);
  const review = validateAuditReview(saved.review, packet.assertions, packet.publicText);
  for (const assertion of packet.assertions) {
    if (assertion.kind !== "ui_text" || assertion.expected?.mode !== "equals") continue;
    const decision = review.assertions.find((item: any) => item.id === assertion.id);
    if (!decision) throw new Error(`Missing audit decision: ${packet.task_id}/${assertion.id}`);
    const value = String(assertion.expected.value);
    const quote = (decision.public_quote ?? "").toLowerCase();
    const directValueMention = quote.includes(value.toLowerCase());
    // A value mention is only a necessary clue. Even a quote containing "Won"
    // would not prove that the entire HUD node must equal this one word.
    risks.push({ task_id: packet.task_id, assertion_id: assertion.id, path: assertion.path,
      expected: assertion.expected, model_verdict: decision.verdict, public_quote: decision.public_quote,
      direct_value_mention: directValueMention,
      gate: directValueMention ? "still_requires_exclusive_text_rule" : "exact_value_not_in_cited_text",
      treatment: "do_not_use_as_certified_game_failure_without_independent_semantic_rule" });
  }
}
const result = { inventory_sha256: contentHash(inventoryText), formal_tasks: 15, exact_hud_assertions: risks.length,
  no_direct_value_mention: risks.filter(r => !r.direct_value_mention).length,
  scope: "Conservative source-risk gate, not a claim that every listed check is invalid", risks };
await writeFile(resolve(root, "exact-hud-risks.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "EXACT-HUD-RISKS.md"), ["# HUD 精确文字判据风险", "",
  `前 15 题中有 ${risks.length} 条要求整个状态节点精确等于某个词；其中 ${result.no_direct_value_mention} 条的混元引文没有直接提到这个取值。即使提到了取值，也仍需题面明确要求节点只能含该词。`, "",
  "例如 Key Door Escape A52 要求 `statusText == Won`，混元援引的只是‘状态文字忽略大小写及连续空白’，这不能排除 `Status: WON - You escaped!` 这样的状态文案。此项从已认证游戏失败分母中隔离，原浏览器记录和原混元判断不改。", "",
  "逐条列表见 exact-hud-risks.json。这里是必要条件筛查，不替代完整语义证明；也不将剩余检查项自动宣布为有效标准。", ""
].join("\n"));
console.log(JSON.stringify({ formal_tasks: 15, exact_hud_assertions: risks.length, no_direct_value_mention: result.no_direct_value_mention }));
