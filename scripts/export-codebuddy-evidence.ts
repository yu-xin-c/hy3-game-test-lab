import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}
const batch = resolve(argument("--batch-dir"));
const output = resolve(argument("--out-dir"));
const manifest = JSON.parse(await readFile(resolve(batch, "batch-manifest.json"), "utf8"));
const index: unknown[] = [];
await mkdir(output, { recursive: true });
for (const task of manifest.tasks) {
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe task id");
  const generationDirectory = resolve(batch, "generated", task.id);
  let generation;
  try {
    generation = JSON.parse(await readFile(resolve(generationDirectory, "generation.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  const resultPath = resolve(generationDirectory, generation.result_file);
  const local = relative(resolve(batch, "runs"), resultPath);
  if (local.startsWith("..") || isAbsolute(local)) throw new Error("Result outside batch runs");
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const promptPath = resolve(batch, "public", task.id, "prompt.md");
  const promptHash = createHash("sha256").update(await readFile(promptPath)).digest("hex");
  if (promptHash !== task.prompt_sha256 || promptHash !== generation.prompt_sha256) {
    throw new Error(`Generation prompt changed: ${task.id}`);
  }
  if (generation.output_sha256 !== result.input_hashes.game_directory_sha256) {
    throw new Error(`Generation metadata does not match evaluated files: ${task.id}`);
  }
  const gameDirectory = resolve(generationDirectory, "files");
  const files = (await readdir(gameDirectory)).sort((a, b) => a.localeCompare(b));
  const expected = ["game.js", "game.manifest.json", "index.html", "styles.css"];
  if (JSON.stringify([...files].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Unexpected files in ${task.id}`);
  }
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file).update("\0").update(await readFile(resolve(gameDirectory, file))).update("\0");
  }
  if (hash.digest("hex") !== result.input_hashes.game_directory_sha256) {
    throw new Error(`Generated files changed since evaluation: ${task.id}`);
  }
  const destination = resolve(output, task.id);
  await mkdir(destination, { recursive: true });
  await cp(gameDirectory, resolve(destination, "game"), { recursive: true });
  await cp(promptPath, resolve(destination, "prompt.md"));
  await writeFile(resolve(destination, "generation.json"), `${JSON.stringify({
    ...generation,
    source_result_file: generation.result_file,
    result_file: "result.json"
  }, null, 2)}\n`);
  await cp(resultPath, resolve(destination, "result.json"));
  await cp(resolve(dirname(resultPath), "events.jsonl"), resolve(destination, "events.jsonl"));
  await cp(resolve(dirname(resultPath), "screenshots"), resolve(destination, "screenshots"), { recursive: true });
  index.push({ task_id: task.id, source_result: relative(batch, resultPath), game_sha256: result.input_hashes.game_directory_sha256 });
}
await writeFile(resolve(output, "index.json"), `${JSON.stringify({ batch_id: manifest.batch_id, scoring_status: "provisional_requires_oracle_review", tasks: index }, null, 2)}\n`);
console.log(`Exported ${index.length} unchanged generated games and browser evidence to ${output}`);
