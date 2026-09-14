import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GameTaskOracleSchema, GameTaskPlanSchema } from "../src/contracts/game-tasks";
import { GameManifestSchema } from "../src/contracts/generation";
import { assertGameManifestMatchesTask } from "../src/contracts/task-adapter";
import { contentHash } from "../src/evaluation/generation-provenance";

const index = process.argv.indexOf("--out");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --out NEW_DIRECTORY");
const out = resolve(process.argv[index + 1]!);
const summary = JSON.parse(await readFile("results/consolidated/summary.json", "utf8"));
const rows = [];
for (const task of summary.tasks) {
  const source = resolve("results/consolidated", task.source_results, "evidence", task.id);
  const planText = await readFile(resolve(source, "task/test-plan.json"), "utf8");
  const oracleText = await readFile(resolve(source, "task/oracle.private.json"), "utf8");
  const manifestText = await readFile(resolve(source, "game/game.manifest.json"), "utf8");
  const plan = GameTaskPlanSchema.parse(JSON.parse(planText));
  const oracle = GameTaskOracleSchema.parse(JSON.parse(oracleText));
  const check = (pointerEquivalence: boolean) => {
    try {
      const manifest = GameManifestSchema.parse(JSON.parse(manifestText));
      assertGameManifestMatchesTask(plan, oracle, manifest, { pointerEquivalence });
      return { pass: true, error: null };
    } catch (error) { return { pass: false, error: String(error) }; }
  };
  rows.push({ task_id: task.id, plan_sha256: contentHash(planText), oracle_sha256: contentHash(oracleText),
    manifest_sha256: contentHash(manifestText), strict_metadata: check(false), pointer_equivalence: check(true) });
}
await mkdir(out, { recursive: false });
const result = { scope: "Manifest compatibility only, not browser gameplay scores. Compare the same code with pointer equivalence disabled/enabled.",
  adapter_sha256: contentHash(await readFile("src/contracts/task-adapter.ts", "utf8")),
  tasks: rows.length, strict_passes: rows.filter(r => r.strict_metadata.pass).length,
  equivalent_passes: rows.filter(r => r.pointer_equivalence.pass).length,
  newly_compatible: rows.filter(r => !r.strict_metadata.pass && r.pointer_equivalence.pass).map(r => r.task_id), rows };
await writeFile(resolve(out, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ tasks: result.tasks, strict_passes: result.strict_passes, equivalent_passes: result.equivalent_passes, newly_compatible: result.newly_compatible }));
