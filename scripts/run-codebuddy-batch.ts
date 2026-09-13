import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}
const root = fileURLToPath(new URL("..", import.meta.url));
const batch = resolve(arg("--batch-dir"));
const cli = resolve(arg("--cli"));
const limit = Number(arg("--limit", "96"));
if (!Number.isInteger(limit) || limit < 1 || limit > 96) throw new Error("Invalid --limit");
const shardCount = Number(arg("--shard-count", "1"));
const shardIndex = Number(arg("--shard-index", "0"));
if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 4 || !Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) throw new Error("Invalid shard");
const manifest = JSON.parse(await readFile(resolve(batch, "batch-manifest.json"), "utf8"));
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
async function optionalJson(path: string) {
  try { return await readJson(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function gameHash(directory: string) {
  const digest = createHash("sha256");
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Nonregular generated file");
    digest.update(entry.name).update("\0").update(await readFile(resolve(directory, entry.name))).update("\0");
  }
  return digest.digest("hex");
}
function run(command: string, args: string[], cwd: string, input: string, timeoutMs: number, outputFile?: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((done, reject) => {
    // A regular stdout file avoids Node CLI process.exit() truncating a large JSON pipe at 64 KiB.
    const fd = outputFile ? openSync(outputFile, "wx") : undefined;
    const child = spawn(command, args, { cwd, stdio: ["pipe", fd ?? "pipe", "pipe"], env: process.env });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.stdout?.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", async code => {
      clearTimeout(timer);
      if (fd !== undefined) closeSync(fd);
      if (outputFile) stdout = await readFile(outputFile, "utf8");
      done({ code, stdout, stderr, timedOut });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

// Freeze private inputs before starting any remaining generation. They are not provided to the CLI.
for (const [taskIndex, task] of manifest.tasks.entries()) {
  if (taskIndex % shardCount !== shardIndex) continue;
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("Unsafe task ID");
  const source = resolve(root, "datasets/game-tasks", task.id);
  const destination = resolve(batch, "private", task.id);
  for (const name of ["brief.md", "GAME_CONTRACT.md"]) {
    const current = await readFile(name === "brief.md" ? resolve(source, name) : resolve(source, "..", name));
    if (!current.equals(await readFile(resolve(batch, "public", task.id, name)))) throw new Error(`Changed public input: ${task.id}`);
  }
  await mkdir(destination, { recursive: true });
  for (const name of ["brief.md", "test-plan.json", "oracle.private.json", "input-sha256.txt", "GAME_CONTRACT.md"]) {
    const bytes = await readFile(name === "GAME_CONTRACT.md" ? resolve(source, "..", name) : resolve(source, name));
    try { await writeFile(resolve(destination, name), bytes, { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await readFile(resolve(destination, name))).equals(bytes)) throw error;
    }
  }
}
let processed = 0;
for (const [taskIndex, task] of manifest.tasks.entries()) {
  if (taskIndex % shardCount !== shardIndex) continue;
  const generationRoot = resolve(batch, "generated", task.id);
  const files = resolve(generationRoot, "files");
  const metadataPath = resolve(generationRoot, "generation.json");
  if (await optionalJson(metadataPath)) continue;
  if (processed >= limit) break;
  const prompt = await readFile(resolve(batch, "public", task.id, "prompt.md"), "utf8");
  if (hash(prompt) !== task.prompt_sha256) throw new Error(`Changed prompt: ${task.id}`);
  const completePath = resolve(generationRoot, "cli-completion.json");
  let completion = await optionalJson(completePath);
  if (!completion) {
    if ((await readdir(files)).length) throw new Error(`Unrecorded partial game: ${task.id}; inspect before resuming`);
    // Exclusive marker prevents a second generation attempt after an interrupted command.
    await writeFile(resolve(generationRoot, "cli-started.json"), JSON.stringify({ started_at: new Date().toISOString(), model: "hy3", attempt: 1 }), { flag: "wx" });
    console.log(`GENERATE ${task.id} (${task.difficulty})`);
    const started = Date.now();
    const generated = await run(cli, ["--model", "hy3", "--effort", "high", "--agent", "cli", "--strict-mcp-config",
      "--tools", "Read,Write,Edit", "--allowedTools", "Read", "Write", "Edit", "--permission-mode", "acceptEdits", "--settings", '{"autoMemoryEnabled":false}',
      "--no-session-persistence", "--max-turns", "30", "-p", "--output-format", "json"], files, prompt, 20 * 60_000, resolve(generationRoot, "cli-output.raw.json"));
    await writeFile(resolve(generationRoot, "cli-stderr.log"), generated.stderr);
    let messages: any[] = [];
    try { const parsed = JSON.parse(generated.stdout); messages = Array.isArray(parsed) ? parsed : [parsed]; } catch { /* record malformed output */ }
    const assistantMessages = messages.filter(message => message.role === "assistant");
    const providerMessages = assistantMessages.filter(message => message.providerData?.requestModelId);
    const models = [...new Set(providerMessages.map(message => message.providerData.requestModelId))];
    const final = messages.findLast(message => message.type === "result");
    completion = {
      model_ids: models, prompt_sha256: hash(prompt), output_sha256: await gameHash(files),
      duration_seconds: (Date.now() - started) / 1000, exit_code: generated.code, timed_out: generated.timedOut,
      success: generated.code === 0 && !generated.timedOut && final?.is_error === false && models.length === 1 && models[0] === "hy3",
      generation_tools: ["Read", "Write", "Edit"],
      failure_reason: /429|使用量已超出频率限制/.test(generated.stderr) ? "rate_limit" : null,
      reset_time_text: generated.stderr.match(/将在\s*([^\n]+?)\s*重置/)?.[1] ?? null,
      credits: providerMessages.reduce((sum, message) => sum + (message.providerData.rawUsage?.credit ?? 0), 0),
      total_tokens: providerMessages.reduce((sum, message) => sum + (message.providerData.rawUsage?.total_tokens ?? 0), 0),
      result_subtype: final?.subtype ?? "missing_result", finished_at: new Date().toISOString()
    };
    await writeFile(completePath, `${JSON.stringify(completion, null, 2)}\n`, { flag: "wx" });
    await writeFile(resolve(generationRoot, "generation-process.json"), `${JSON.stringify(assistantMessages.map(message => ({
      type: message.type, role: message.role, content: message.content, providerData: message.providerData
    })), null, 2)}\n`);
  }
  if (!completion.success) {
    const failureOut = resolve(batch, "runs", `${task.id}-playthrough`);
    await mkdir(failureOut, { recursive: true });
    await writeFile(resolve(failureOut, "result.json"), `${JSON.stringify({ task_id: task.id, generator: "codebuddy-hy3",
      status: "infrastructure_failure", error: "Generation did not finish with a verified Hy3 response. Not scored as a game failure.",
      input_hashes: { game_directory_sha256: completion.output_sha256 }, generation_completion: completion }, null, 2)}\n`, { flag: "wx" });
    await writeFile(resolve(failureOut, "events.jsonl"), "", { flag: "wx" });
    await writeFile(metadataPath, `${JSON.stringify({ batch_id: manifest.batch_id, task_id: task.id, generator: "CodeBuddy CLI", model: "Hy3 High",
      requested_model: "hy3", verified_model_ids: completion.model_ids, prompt_sha256: completion.prompt_sha256,
      output_sha256: completion.output_sha256, attempt: 1, manual_code_edits: false, result: "infrastructure_failure",
      result_file: `../../runs/${task.id}-playthrough/result.json`, scoring_status: "excluded_infrastructure_failure" }, null, 2)}\n`, { flag: "wx" });
    processed++;
    console.log(`INFRASTRUCTURE FAILURE ${task.id}: preserved; continuing without scoring it as a model failure.`);
    if (completion.failure_reason === "rate_limit") throw new Error(`Hy3 rate limited; remaining tasks are not dispatched. Reset: ${completion.reset_time_text ?? "unknown"}`);
    continue;
  }
  if (await gameHash(files) !== completion.output_sha256) throw new Error(`Generated code changed: ${task.id}`);
  const out = resolve(batch, "runs", `${task.id}-playthrough`);
  let evaluation = await optionalJson(resolve(out, "result.json"));
  if (!evaluation) {
    console.log(`EVALUATE ${task.id}`);
    const evaluated = await run(process.execPath, ["--import", "tsx", resolve(root, "scripts/evaluate-generated-task.ts"),
      "--task", task.id, "--task-dir", resolve(batch, "private", task.id), "--game-dir", files, "--out", out,
      "--generator", "codebuddy-hy3", "--replays", "3"], root, "", 20 * 60_000);
    await writeFile(resolve(generationRoot, "evaluation.log"), evaluated.stdout + evaluated.stderr);
    evaluation = await optionalJson(resolve(out, "result.json"));
    if (!evaluation) throw new Error(`Evaluator did not finish: ${task.id}`);
  }
  await writeFile(metadataPath, `${JSON.stringify({
    schema_version: "gametestlab.codebuddy-generation.v1", batch_id: manifest.batch_id, task_id: task.id,
    generator: "CodeBuddy CLI", cli_version: "2.150.0", model: "Hy3 High", model_id: "hy3",
    generation_tools: completion.generation_tools ?? ["Write"], prompt_sha256: completion.prompt_sha256, output_sha256: completion.output_sha256,
    attempt: 1, manual_code_edits: false, credits_used: completion.credits, reported_tokens: completion.total_tokens,
    reported_duration_seconds: completion.duration_seconds, result: evaluation.status,
    result_file: `../../runs/${task.id}-playthrough/result.json`, scoring_status: "provisional_requires_oracle_review"
  }, null, 2)}\n`, { flag: "wx" });
  processed++;
  console.log(`RECORDED ${task.id}: ${evaluation.status}, ${JSON.stringify(evaluation.aggregate ?? {})}`);
}
console.log(`Batch invocation completed: ${processed} new games recorded.`);
