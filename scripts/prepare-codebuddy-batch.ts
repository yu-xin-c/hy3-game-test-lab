import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GameTaskSetManifestSchema } from "../src/contracts/game-tasks";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const batchId = argument("--batch-id") ?? "20260912-formal-96-v3";
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(batchId)) {
  throw new Error("Unsafe --batch-id");
}
const experimentRoot = resolve(
  repositoryRoot,
  "..",
  "codebuddy-hy3-experiments",
  batchId
);
const taskRoot = resolve(repositoryRoot, "datasets/game-tasks");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const manifest = GameTaskSetManifestSchema.parse(
  JSON.parse(await readFile(resolve(taskRoot, "manifest.json"), "utf8")) as unknown
);
const contract = await readFile(resolve(taskRoot, manifest.contract_file), "utf8");
await Promise.all([
  mkdir(resolve(experimentRoot, "public"), { recursive: true }),
  mkdir(resolve(experimentRoot, "generated"), { recursive: true }),
  mkdir(resolve(experimentRoot, "runs"), { recursive: true })
]);

const batchTasks: unknown[] = [];
for (const task of manifest.tasks) {
  const sourceDirectory = resolve(taskRoot, task.directory);
  const publicDirectory = resolve(experimentRoot, "public", task.id);
  const outputDirectory = resolve(experimentRoot, "generated", task.id, "files");
  await mkdir(publicDirectory, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  const existingOutput = await readdir(outputDirectory);
  if (existingOutput.length > 0) {
    throw new Error(`Refusing to touch non-empty CodeBuddy output: ${outputDirectory}`);
  }
  const brief = await readFile(resolve(sourceDirectory, "brief.md"), "utf8");
  const prompt = `请在当前空目录中实现一个完整浏览器游戏。不要解释，不要创建说明文档，只创建生成要求指定的四个文件。完成后先检查文件名、JSON格式和浏览器运行错误；不要读取当前目录之外的文件，也不要修改任务要求。\n\n${contract.trim()}\n\n${brief.trim()}\n`;
  const promptHash = sha256(prompt);
  await Promise.all([
    writeFile(resolve(publicDirectory, "brief.md"), brief, "utf8"),
    writeFile(resolve(publicDirectory, "GAME_CONTRACT.md"), contract, "utf8"),
    writeFile(resolve(publicDirectory, "prompt.md"), prompt, "utf8"),
    writeFile(resolve(publicDirectory, "prompt-sha256.txt"), `${promptHash}  prompt.md\n`, "utf8")
  ]);
  batchTasks.push({
    id: task.id,
    category: task.category,
    features: task.features,
    difficulty: task.difficulty,
    prompt_file: `public/${task.id}/prompt.md`,
    prompt_sha256: promptHash,
    output_directory: `generated/${task.id}/files`,
    status: "pending"
  });
}

await writeFile(resolve(experimentRoot, "batch-manifest.json"), `${JSON.stringify({
  schema_version: "gametestlab.codebuddy-batch.v1",
  batch_id: batchId,
  created_at: new Date().toISOString(),
  model_family: "Hy3 via CodeBuddy CN",
  policy: {
    fresh_session_per_task: true,
    one_generation_attempt: true,
    manual_code_edits: false,
    private_oracle_visible_to_generator: false
  },
  tasks: batchTasks
}, null, 2)}\n`, "utf8");

console.log(`Prepared ${batchTasks.length} CodeBuddy workspaces: ${experimentRoot}`);
