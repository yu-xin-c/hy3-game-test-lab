import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Inventory only: empty/unstarted generation directories are never scored as model failures.
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`Missing ${name}`);
  return value;
}
const batchArg = arg("--batch-dir");
if (!batchArg) throw new Error("Missing --batch-dir");
const batch = resolve(batchArg);
const manifest = JSON.parse(await readFile(resolve(batch, "batch-manifest.json"), "utf8"));
const records = [];
await mkdir(resolve(batch, "runs"), { recursive: true });
for (const task of manifest.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe task ID");
  const generationRoot = resolve(batch, "generated", task.id);
  const files = resolve(generationRoot, "files");
  const names = await readdir(files);
  const out = resolve(batch, "runs", `${task.id}-playthrough`);
  let result;
  try { result = JSON.parse(await readFile(resolve(out, "result.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (result && result.task_id !== task.id) throw new Error(`Result ID mismatch: ${task.id}`);
  records.push({
    task_id: task.id,
    difficulty: task.difficulty,
    category: task.category,
    status: result?.status ?? (names.length ? "awaiting_generation_completion_record" : "not_generated"),
    result_file: result ? `runs/${task.id}-playthrough/result.json` : null,
    aggregate: result?.aggregate ?? null
  });
}
const counts: Record<string, number> = {};
for (const record of records) counts[record.status] = (counts[record.status] ?? 0) + 1;
const pending = records.filter(record => ["not_generated", "awaiting_generation_completion_record"].includes(record.status)).length;
const report = { batch_id: manifest.batch_id, updated_at: new Date().toISOString(), expected_tasks: manifest.tasks.length,
  recorded_results: records.filter(record => record.result_file).length,
  completed_evaluations: records.filter(record => ["evaluated", "evaluated_with_contract_findings"].includes(record.status)).length, pending_tasks: pending,
  all_tasks_processed: pending === 0, status_counts: counts, tasks: records };
await writeFile(resolve(batch, "progress.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ completed: report.completed_evaluations, pending, status_counts: counts }));
