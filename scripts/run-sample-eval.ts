import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, platform, release } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loadDatasetEntry, loadManifest } from "../src/contracts/loaders";
import { resolveRegularFileInsideRoot } from "../src/contracts/paths";
import {
  CaseResultArtifactV2Schema,
  LatestRunPointerSchema,
  RunSummaryV2Schema,
  StoredTraceV2Schema,
  type CaseResultArtifactV2,
  type RunSummaryV2
} from "../src/contracts/artifacts";
import {
  CaseEvaluationSchema,
  ObservationSchema
} from "../src/contracts/schemas";
import { evaluateCase } from "../src/evaluation/evaluator";
import {
  computeMetrics,
  type EvaluatedSample
} from "../src/evaluation/metrics";
import { runPlaythrough } from "../src/runtime/playthrough";
import { startStaticServer } from "../src/runtime/static-server";
import { validateDataset } from "./validate-dataset";

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const playwrightVersion = (
  require("@playwright/test/package.json") as { version: string }
).version;

function filesystemTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function repositoryRelative(repositoryRoot: string, path: string): string {
  return relative(repositoryRoot, path).split("\\").join("/");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in hashed game directories: ${path}`);
    }
  }
  return files.sort();
}

async function sha256Directory(directory: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await collectFiles(directory)) {
    hash.update(repositoryRelative(directory, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function gitState(repositoryRoot: string): Promise<{
  commit: string;
  dirty: boolean;
}> {
  const [commit, status] = await Promise.all([
    execFile("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
    execFile("git", ["status", "--porcelain"], { cwd: repositoryRoot })
  ]);
  return {
    commit: commit.stdout.trim(),
    dirty: status.stdout.trim().length > 0
  };
}

async function updateLatestPointer(
  runsDirectory: string,
  pointer: Record<string, unknown>
): Promise<void> {
  const pointerPath = resolve(runsDirectory, "latest.json");
  const temporaryPath = resolve(
    runsDirectory,
    `.latest-${randomUUID()}.tmp`
  );
  await writeJson(temporaryPath, pointer);
  await rename(temporaryPath, pointerPath);
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const manifestPath = resolve(repositoryRoot, "datasets/manifest.json");
  await validateDataset(repositoryRoot, "datasets/manifest.json");
  const manifest = await loadManifest(manifestPath);
  const [manifestSha256, repositoryState] = await Promise.all([
    sha256File(manifestPath),
    gitState(repositoryRoot)
  ]);
  const datasetEntries = await Promise.all(
    manifest.cases.map(async (entry) => ({
      entry,
      ...(await loadDatasetEntry(repositoryRoot, entry))
    }))
  );
  const startedAt = new Date();
  const runId = `${filesystemTimestamp(startedAt)}-${randomUUID().slice(0, 8)}`;
  const runsDirectory = resolve(repositoryRoot, "artifacts/runs");
  const runDirectory = resolve(runsDirectory, runId);
  await mkdir(runDirectory, { recursive: false }).catch(async (error: unknown) => {
    // The first run also needs its two parent directories. A second attempt
    // remains non-overwriting because run IDs include a UUID suffix.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(runsDirectory, { recursive: true });
    await mkdir(runDirectory, { recursive: false });
  });

  const server = await startStaticServer({
    rootDirectory: repositoryRoot,
    host: "127.0.0.1",
    port: 0
  });

  const caseArtifacts: CaseResultArtifactV2[] = [];
  const evaluatedSamples: EvaluatedSample[] = [];
  const traceLines: string[] = [];
  let browserVersion = "unknown";

  let browser;
  try {
    const executablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {})
    });
    browserVersion = browser.version();

    for (const { entry, publicCase, oracle } of datasetEntries) {
      const [casePath, oraclePath, gameEntryPath] = await Promise.all([
        resolveRegularFileInsideRoot(repositoryRoot, entry.case_file, {
          rejectSymlink: true
        }),
        resolveRegularFileInsideRoot(repositoryRoot, entry.oracle_file, {
          rejectSymlink: true
        }),
        resolveRegularFileInsideRoot(
          repositoryRoot,
          publicCase.game.entry_path.slice(1),
          { requiredPrefix: "examples", rejectSymlink: true }
        )
      ]);
      const [caseSha256, oracleSha256, gameDirectorySha256] = await Promise.all([
        sha256File(casePath),
        sha256File(oraclePath),
        sha256Directory(dirname(gameEntryPath))
      ]);
      const context = await browser.newContext({
        viewport: publicCase.game.viewport,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        ...(publicCase.controls.some((control) => control.device === "touch")
          ? { hasTouch: true }
          : {})
      });

      try {
        const page = await context.newPage();
        const playthrough = await runPlaythrough({
          page,
          baseURL: server.origin,
          publicCase,
          scenarioId: oracle.scenario_id,
          fixtureVariant: entry.fixture_variant,
          evidenceDirectory: resolve(
            runDirectory,
            "screenshots",
            publicCase.id
          ),
          evidencePathRoot: repositoryRoot
        });
        const storedObservations = playthrough.observations.map((observation) =>
          ObservationSchema.parse(jsonRoundTrip(observation))
        );
        const evaluation = CaseEvaluationSchema.parse(
          jsonRoundTrip(evaluateCase(publicCase, oracle, storedObservations))
        );

        evaluatedSamples.push({ evaluation, oracle });
        caseArtifacts.push(CaseResultArtifactV2Schema.parse(jsonRoundTrip({
          schema_version: "gametestlab.case-result.v2",
          case_id: publicCase.id,
          title: publicCase.title,
          difficulty: publicCase.difficulty,
          fixture_variant: entry.fixture_variant,
          case_file: entry.case_file,
          oracle_file: entry.oracle_file,
          oracle_ground_truth: oracle.fault_ground_truth,
          input_hashes: {
            case_sha256: caseSha256,
            oracle_sha256: oracleSha256,
            game_directory_sha256: gameDirectorySha256
          },
          evaluation,
          observations: storedObservations,
          browser: {
            url: playthrough.url,
            console: playthrough.console,
            page_errors: playthrough.page_errors,
            network: playthrough.network,
            diagnostics: playthrough.diagnostics
          }
        })));
        for (const event of playthrough.trace) {
          const storedTrace = StoredTraceV2Schema.parse(
            jsonRoundTrip({ run_id: runId, ...event })
          );
          traceLines.push(JSON.stringify(storedTrace));
        }

        console.log(
          `${publicCase.id}: process=${String(evaluation.process_correct)} ` +
            `final=${String(evaluation.final_outcome_correct)} ` +
            `first=${evaluation.first_failure?.checkpoint_id ?? "none"}`
        );
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist")) {
      throw new Error(
        "Chromium is not installed. Run `pnpm exec playwright install chromium` and retry.",
        { cause: error }
      );
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }

  const finishedAt = new Date();
  const summary: RunSummaryV2 = RunSummaryV2Schema.parse({
    schema_version: "gametestlab.run-summary.v2",
    run_id: runId,
    created_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    dataset: {
      name: manifest.name,
      version: manifest.version,
      manifest: repositoryRelative(repositoryRoot, manifestPath),
      manifest_sha256: manifestSha256
    },
    runtime: {
      browser: "chromium",
      browser_version: browserVersion,
      headless: true,
      hy3_api_used: false,
      node_version: process.version,
      playwright_version: playwrightVersion,
      os: `${platform()} ${release()} ${arch()}`,
      git_commit: repositoryState.commit,
      git_dirty: repositoryState.dirty
    },
    artifact_files: {
      action_trace: "events.jsonl",
      case_results: "cases.json",
      summary: "summary.json"
    },
    metrics: computeMetrics(evaluatedSamples)
  });

  await writeFile(
    resolve(runDirectory, "events.jsonl"),
    traceLines.length === 0 ? "" : `${traceLines.join("\n")}\n`,
    "utf8"
  );
  await writeJson(resolve(runDirectory, "cases.json"), caseArtifacts);
  await writeJson(resolve(runDirectory, "summary.json"), summary);
  await updateLatestPointer(runsDirectory, LatestRunPointerSchema.parse({
    schema_version: "gametestlab.latest-run.v1",
    run_id: runId,
    run_path: repositoryRelative(repositoryRoot, runDirectory),
    summary_path: repositoryRelative(
      repositoryRoot,
      resolve(runDirectory, "summary.json")
    ),
    updated_at: finishedAt.toISOString()
  }));

  console.log(`Artifacts: ${runDirectory}`);
  console.log(JSON.stringify(summary.metrics, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
