import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkGridMapClaims } from "../src/evaluation/grid-map-claims";

const root = resolve(process.argv[2] ?? "results/process-15-v1");
const scope = JSON.parse(await readFile(resolve(root, "scope.json"), "utf8"));
if (scope.schema_version !== "hy3-process-15-scope.v1") throw new Error("Expected formal 15-task scope");
const reused = new Map(scope.reused_completed_games.map((item: any) => [item.id, item.source]));
const rows: any[] = [];
for (const id of scope.selected_ids) {
  const dir = resolve(reused.get(id) as string ?? resolve(root, id));
  let brief: string, plan: any;
  try {
    brief = await readFile(resolve(dir, "task/brief.md"), "utf8");
    plan = JSON.parse(await readFile(resolve(dir, "solution-plan.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  if (!/```text\s*\n[#A-Z.\n]+```/.test(brief)) continue;
  const step = plan.steps.find((item: any) => /\b[A-Z]\s*\(\d+,\s*\d+\)/.test(item.implementation));
  if (!step) continue;
  const claims = checkGridMapClaims(brief, step.implementation);
  rows.push({ id, step_id: step.id, claims, wrong_symbols: claims.filter(c => !c.valid).map(c => c.symbol),
    status: claims.length ? "checked_explicit_coordinate_claims_only" : "no_unique_symbol_coordinate_claims" });
}
const result = { scope: "Independent ASCII-grid source check of explicit public-plan coordinates, not complete plan correctness", reviewed_grid_plans: rows.length,
  wrong_coordinate_plans: rows.filter(r => r.wrong_symbols.length).length, rows };
await writeFile(resolve(root, "grid-plan-claims.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(root, "GRID-PLAN-CLAIMS.md"), ["# 地图坐标方案核验", "",
  `在已保存的前 15 题方案中，${rows.length} 份有可直接核对的 ASCII 地图坐标陈述；${result.wrong_coordinate_plans} 份的明确坐标与公开地图不符。只核对方案写出的坐标，不把它扩成整份方案的正确率。`, "",
  ...rows.map(r => `- ${r.id} 第 ${r.step_id} 步：${r.wrong_symbols.length ? `错位 ${r.wrong_symbols.join("、")}` : "明确坐标均吻合"}。`), "",
  "Key Door Escape 原方案第 1 步最后写出的 `T(3,3)`，地图实际是 `T(4,3)`。此错误后来在实现说明中得到修正，不能据此说最终代码仍使用错误坐标；模型对原方案第 1 步的定位可与独立地图标准比较。", ""
].join("\n"));
console.log(JSON.stringify({ reviewed_grid_plans: rows.length, wrong_coordinate_plans: result.wrong_coordinate_plans }));
