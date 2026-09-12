import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  GameTaskOracleSchema,
  GameTaskPlanSchema
} from "../src/contracts/game-tasks";
import {
  GAME_PACKAGE_FILE_ALLOWLIST,
  GAME_PACKAGE_SCHEMA_VERSION,
  GameManifestSchema,
  GeneratedGamePackageSchema,
} from "../src/contracts/generation";
import {
  assertGameManifestMatchesTask,
  taskPlanToPublicCase,
  taskScenarioToPrivateOracle
} from "../src/contracts/task-adapter";
import {
  CaseEvaluationSchema,
  ObservationSchema
} from "../src/contracts/schemas";
import { evaluateCase } from "../src/evaluation/evaluator";
import { runPlaythrough } from "../src/runtime/playthrough";
import { startStaticServer } from "../src/runtime/static-server";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function sha256Directory(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Generated game directory must contain regular files only: ${entry.name}`);
    }
    hash.update(entry.name);
    hash.update("\0");
    hash.update(await readFile(resolve(directory, entry.name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

interface ContractFinding {
  path: string;
  message: string;
}

function canContinueAfterContractFinding(message: string): boolean {
  return message === "game.js bridge is missing gametestlab/2" ||
    message === "game.manifest.json must contain valid JSON" ||
    message.startsWith("invalid game.manifest.json:");
}

async function inspectGeneratedPackage(gameDirectory: string): Promise<{
  contractFindings: ContractFinding[];
  manifest: unknown | null;
}> {
  const entries = await readdir(gameDirectory, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  const expected = [...GAME_PACKAGE_FILE_ALLOWLIST].sort();
  if (
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
    JSON.stringify(names) !== JSON.stringify(expected)
  ) {
    throw new Error(
      `Generated game must contain exactly: ${GAME_PACKAGE_FILE_ALLOWLIST.join(", ")}`
    );
  }
  const candidate = {
    schema_version: GAME_PACKAGE_SCHEMA_VERSION,
    files: await Promise.all(GAME_PACKAGE_FILE_ALLOWLIST.map(async (path) => ({
      path,
      content: await readFile(resolve(gameDirectory, path), "utf8")
    })))
  };
  const validation = GeneratedGamePackageSchema.safeParse(candidate);
  const contractFindings: ContractFinding[] = validation.success
    ? []
    : validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
  const gameSource = candidate.files.find((file) => file.path === "game.js")?.content ?? "";
  if (!/\bprotocol\s*:\s*["']gametestlab\/2["']/.test(gameSource)) {
    contractFindings.push({
      path: "game.js.window.__GAMETESTLAB__",
      message: "runtime bridge does not declare protocol: gametestlab/2"
    });
  }
  const fatalFindings = contractFindings.filter(
    (finding) =>
      finding.message !== "runtime bridge does not declare protocol: gametestlab/2" &&
      !canContinueAfterContractFinding(finding.message)
  );
  if (fatalFindings.length > 0) {
    throw new Error(fatalFindings.map((finding) => finding.message).join("\n"));
  }

  let manifest: unknown | null = null;
  try {
    const manifestFile = candidate.files.find((file) => file.path === "game.manifest.json");
    manifest = JSON.parse(manifestFile?.content ?? "") as unknown;
  } catch {
    // Invalid JSON is retained as a contract finding; the frozen task plan can still drive input.
  }
  return { contractFindings, manifest };
}

const taskId = requiredArgument("--task");
if (!/^[a-z][a-z0-9-]*$/.test(taskId)) throw new Error("Unsafe task ID");
const gameDirectory = resolve(requiredArgument("--game-dir"));
const replayCount = Number(argument("--replays") ?? "1");
if (!Number.isInteger(replayCount) || replayCount < 1 || replayCount > 20) {
  throw new Error("--replays must be an integer from 1 to 20");
}
const generator = argument("--generator") ?? "unspecified";
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDirectory = resolve(
  argument("--out") ?? `artifacts/formal/${taskId}-${timestamp}`
);
await mkdir(outputDirectory, { recursive: false }).catch(async (error: unknown) => {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  await mkdir(resolve(outputDirectory, ".."), { recursive: true });
  await mkdir(outputDirectory, { recursive: false });
});

let failurePhase: "generation_validation" | "playthrough" = "generation_validation";
try {
const taskDirectory = resolve(repositoryRoot, "datasets/game-tasks", taskId);
const [plan, taskOracle, packageInspection] = await Promise.all([
  readJson(resolve(taskDirectory, "test-plan.json")).then((value) =>
    GameTaskPlanSchema.parse(value)
  ),
  readJson(resolve(taskDirectory, "oracle.private.json")).then((value) =>
    GameTaskOracleSchema.parse(value)
  ),
  inspectGeneratedPackage(gameDirectory)
]);
const contractFindings = [...packageInspection.contractFindings];
const manifestResult = GameManifestSchema.safeParse(packageInspection.manifest);
if (manifestResult.success) {
  try {
    assertGameManifestMatchesTask(plan, taskOracle, manifestResult.data);
  } catch (error: unknown) {
    contractFindings.push({
      path: "game.manifest.json",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
const adapted = {
  publicCase: taskPlanToPublicCase(plan),
  scenarioOracles: plan.scenarios.map((scenario) =>
    taskScenarioToPrivateOracle(plan, taskOracle, scenario.id)
  )
};
const server = await startStaticServer({
  rootDirectory: gameDirectory,
  exposure: "isolated-root"
});
const executablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {})
});
const browserVersion = browser.version();
failurePhase = "playthrough";

const scenarioResults: unknown[] = [];
const traceLines: string[] = [];
const startedAt = new Date();
try {
  for (let replayIndex = 0; replayIndex < replayCount; replayIndex += 1) {
    for (const oracle of adapted.scenarioOracles) {
      const context = await browser.newContext({
        viewport: adapted.publicCase.game.viewport,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        ...(adapted.publicCase.controls.some((control) => control.device === "touch")
          ? { hasTouch: true }
          : {})
      });
      try {
        const page = await context.newPage();
        const secondaryPage = plan.environment.pages === 2
          ? await context.newPage()
          : undefined;
        const evidenceDirectory = resolve(
          outputDirectory,
          "screenshots",
          `replay-${String(replayIndex + 1)}`,
          oracle.scenario_id
        );
        const playthrough = await runPlaythrough({
          page,
          ...(secondaryPage ? { secondaryPage } : {}),
          baseURL: server.origin,
          publicCase: adapted.publicCase,
          scenarioId: oracle.scenario_id,
          fixtureVariant: "formal",
          acceptMissingBridgeProtocol: true,
          evidenceDirectory,
          evidencePathRoot: outputDirectory
        });
        const observations = playthrough.observations.map((observation) =>
          ObservationSchema.parse(jsonRoundTrip(observation))
        );
        const evaluation = CaseEvaluationSchema.parse(jsonRoundTrip(
          evaluateCase(adapted.publicCase, oracle, observations)
        ));
        scenarioResults.push({
          replay_index: replayIndex,
          scenario_id: oracle.scenario_id,
          evaluation,
          observations,
          browser: {
            url: playthrough.url,
            console: playthrough.console,
            page_errors: playthrough.page_errors,
            network: playthrough.network,
            diagnostics: playthrough.diagnostics
          }
        });
        for (const trace of playthrough.trace) {
          traceLines.push(JSON.stringify({
            task_id: taskId,
            replay_index: replayIndex,
            ...jsonRoundTrip(trace) as Record<string, unknown>
          }));
        }
        console.log(
          `${taskId} replay=${String(replayIndex + 1)} scenario=${oracle.scenario_id} ` +
          `process=${String(evaluation.process_correct)} final=${String(evaluation.final_outcome_correct)}`
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

const typedResults = scenarioResults as Array<{
  evaluation: ReturnType<typeof CaseEvaluationSchema.parse>;
}>;
const finishedAt = new Date();
const result = {
  schema_version: "gametestlab.formal-task-result.v1",
  task_id: taskId,
  title: plan.title,
  category: plan.category,
  features: plan.features,
  difficulty: plan.difficulty,
  generator,
  status: contractFindings.length === 0
    ? "evaluated"
    : "evaluated_with_contract_findings",
  started_at: startedAt.toISOString(),
  finished_at: finishedAt.toISOString(),
  replay_count: replayCount,
  browser: { name: "chromium", version: browserVersion },
  input_hashes: {
    frozen_task_sha256: await sha256File(resolve(taskDirectory, "input-sha256.txt")),
    game_directory_sha256: await sha256Directory(gameDirectory),
    game_manifest_sha256: await sha256File(resolve(gameDirectory, "game.manifest.json"))
  },
  aggregate: {
    contract_pass: contractFindings.length === 0,
    scenario_runs: typedResults.length,
    process_passes: typedResults.filter((entry) => entry.evaluation.process_correct).length,
    final_passes: typedResults.filter((entry) => entry.evaluation.final_outcome_correct).length,
    lucky_passes: typedResults.filter((entry) => entry.evaluation.lucky_pass_detected).length,
    L1_passes: typedResults.filter((entry) => entry.evaluation.gates.L1 === "pass").length,
    L2_passes: typedResults.filter((entry) => entry.evaluation.gates.L2 === "pass").length,
    L3_passes: typedResults.filter((entry) => entry.evaluation.gates.L3 === "pass").length
  },
  contract: {
    conformant: contractFindings.length === 0,
    findings: contractFindings
  },
  scenarios: scenarioResults,
  files: {
    result: "result.json",
    trace: "events.jsonl"
  }
};
await writeFile(resolve(outputDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(
  resolve(outputDirectory, "events.jsonl"),
  traceLines.length > 0 ? `${traceLines.join("\n")}\n` : "",
  "utf8"
);
console.log(`Result: ${resolve(outputDirectory, "result.json")}`);
console.log(`Game: ${basename(gameDirectory)}`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  let gameDirectorySha256: string | null = null;
  try {
    gameDirectorySha256 = await sha256Directory(gameDirectory);
  } catch {
    // The validation message already describes malformed directory contents.
  }
  const failureResult = {
    schema_version: "gametestlab.formal-task-result.v1",
    task_id: taskId,
    generator,
    status: failurePhase === "generation_validation"
      ? "generation_failure"
      : "evaluation_failure",
    failed_phase: failurePhase,
    error: message,
    finished_at: new Date().toISOString(),
    input_hashes: {
      game_directory_sha256: gameDirectorySha256
    }
  };
  await writeFile(
    resolve(outputDirectory, "result.json"),
    `${JSON.stringify(failureResult, null, 2)}\n`,
    "utf8"
  );
  await writeFile(resolve(outputDirectory, "events.jsonl"), "", "utf8");
  console.error(`${failureResult.status}: ${message}`);
  console.error(`Result: ${resolve(outputDirectory, "result.json")}`);
  process.exitCode = 1;
}
