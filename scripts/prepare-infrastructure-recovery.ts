import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  const value = i < 0 ? undefined : process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return resolve(value);
}
const source = arg("--source-batch");
const destination = arg("--out-batch");
if (source === destination) throw new Error("Recovery must use a separate batch");
const manifest = JSON.parse(await readFile(resolve(source, "batch-manifest.json"), "utf8"));
const alreadyRetried = new Set<string>();
if (process.argv.includes("--exclude-results")) {
  const previous = JSON.parse(await readFile(resolve(arg("--exclude-results"), "summary.json"), "utf8"));
  for (const task of previous.tasks) if (["evaluated", "evaluated_with_contract_findings", "generation_failure"].includes(task.status)) alreadyRetried.add(task.id);
}
const selected = [];
for (const task of manifest.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe task ID");
  let generation;
  try { generation = JSON.parse(await readFile(resolve(source, "generated", task.id, "generation.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; throw e; }
  if (generation.result !== "infrastructure_failure") continue;
  if (alreadyRetried.has(task.id)) continue;
  const prompt = await readFile(resolve(source, "public", task.id, "prompt.md"));
  if (createHash("sha256").update(prompt).digest("hex") !== task.prompt_sha256) throw new Error("Changed prompt");
  selected.push({ ...task, status: "pending", recovery_of: { batch_id: manifest.batch_id, result: generation.result, original_output_sha256: generation.output_sha256 } });
}
if (!selected.length) throw new Error("No recorded infrastructure failures to recover");
// Fail on an existing target; no original attempt or recovery attempt is overwritten.
await mkdir(destination);
for (const task of selected) {
  await mkdir(resolve(destination, "generated", task.id, "files"), { recursive: true });
  for (const section of ["public", "private"]) {
    await mkdir(resolve(destination, section, task.id), { recursive: true });
    const names = section === "public" ? ["brief.md", "GAME_CONTRACT.md", "prompt.md", "prompt-sha256.txt"]
      : ["brief.md", "GAME_CONTRACT.md", "test-plan.json", "oracle.private.json", "input-sha256.txt"];
    for (const name of names) await writeFile(resolve(destination, section, task.id, name), await readFile(resolve(source, section, task.id, name)), { flag: "wx" });
  }
}
await writeFile(resolve(destination, "batch-manifest.json"), JSON.stringify({ ...manifest, batch_id: basename(destination),
  created_at: new Date().toISOString(), recovery_of_batch: manifest.batch_id,
  recovery_policy: "One separately reported attempt for infrastructure failures only. Original scores and artifacts remain unchanged.", tasks: selected }, null, 2) + "\n", { flag: "wx" });
console.log(`Prepared ${selected.length} separate recovery tasks: ${selected.map(t => t.id).join(", ")}`);
