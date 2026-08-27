import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loadDatasetEntry, loadManifest } from "../src/contracts/loaders";
import type {
  CaseEvaluation,
  Observation,
  PrivateOracle,
  PublicCase
} from "../src/contracts/schemas";
import { evaluateCase } from "../src/evaluation/evaluator";
import {
  computeMetrics,
  type AggregateMetrics,
  type EvaluatedSample
} from "../src/evaluation/metrics";
import {
  runPlaythrough,
  type BrowserConsoleRecord,
  type BrowserPageErrorRecord,
  type RuntimeDiagnostic
} from "../src/runtime/playthrough";
import { startStaticServer } from "../src/runtime/static-server";

interface CaseArtifact {
  schema_version: "prd2play.case-result.v1";
  case_id: string;
  title: string;
  difficulty: PublicCase["difficulty"];
  fixture_variant: string;
  case_file: string;
  oracle_file: string;
  oracle_ground_truth: PrivateOracle["fault_ground_truth"];
  evaluation: CaseEvaluation;
  observations: Observation[];
  browser: {
    url: string;
    console: BrowserConsoleRecord[];
    page_errors: BrowserPageErrorRecord[];
    diagnostics: RuntimeDiagnostic[];
  };
}

interface RunSummary {
  schema_version: "prd2play.run-summary.v1";
  run_id: string;
  created_at: string;
  finished_at: string;
  dataset: {
    name: string;
    version: string;
    manifest: string;
  };
  runtime: {
    browser: "chromium";
    browser_version: string;
    headless: true;
    hy3_api_used: false;
  };
  artifact_files: {
    action_trace: "events.jsonl";
    case_results: "cases.json";
    summary: "summary.json";
  };
  metrics: AggregateMetrics;
}

function filesystemTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function repositoryRelative(repositoryRoot: string, path: string): string {
  return relative(repositoryRoot, path).split("\\").join("/");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  const manifest = await loadManifest(manifestPath);
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

  const caseArtifacts: CaseArtifact[] = [];
  const evaluatedSamples: EvaluatedSample[] = [];
  const traceLines: string[] = [];
  let browserVersion = "unknown";

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    browserVersion = browser.version();

    for (const { entry, publicCase, oracle } of datasetEntries) {
      const context = await browser.newContext({
        viewport: publicCase.game.viewport,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai"
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
        const evaluation = evaluateCase(
          publicCase,
          oracle,
          playthrough.observations
        );

        evaluatedSamples.push({ evaluation, oracle });
        caseArtifacts.push({
          schema_version: "prd2play.case-result.v1",
          case_id: publicCase.id,
          title: publicCase.title,
          difficulty: publicCase.difficulty,
          fixture_variant: entry.fixture_variant,
          case_file: entry.case_file,
          oracle_file: entry.oracle_file,
          oracle_ground_truth: oracle.fault_ground_truth,
          evaluation,
          observations: playthrough.observations,
          browser: {
            url: playthrough.url,
            console: playthrough.console,
            page_errors: playthrough.page_errors,
            diagnostics: playthrough.diagnostics
          }
        });
        for (const event of playthrough.trace) {
          traceLines.push(JSON.stringify({ run_id: runId, ...event }));
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
  const summary: RunSummary = {
    schema_version: "prd2play.run-summary.v1",
    run_id: runId,
    created_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    dataset: {
      name: manifest.name,
      version: manifest.version,
      manifest: repositoryRelative(repositoryRoot, manifestPath)
    },
    runtime: {
      browser: "chromium",
      browser_version: browserVersion,
      headless: true,
      hy3_api_used: false
    },
    artifact_files: {
      action_trace: "events.jsonl",
      case_results: "cases.json",
      summary: "summary.json"
    },
    metrics: computeMetrics(evaluatedSamples)
  };

  await writeFile(
    resolve(runDirectory, "events.jsonl"),
    traceLines.length === 0 ? "" : `${traceLines.join("\n")}\n`,
    "utf8"
  );
  await writeJson(resolve(runDirectory, "cases.json"), caseArtifacts);
  await writeJson(resolve(runDirectory, "summary.json"), summary);
  await updateLatestPointer(runsDirectory, {
    schema_version: "prd2play.latest-run.v1",
    run_id: runId,
    run_path: repositoryRelative(repositoryRoot, runDirectory),
    summary_path: repositoryRelative(
      repositoryRoot,
      resolve(runDirectory, "summary.json")
    ),
    updated_at: finishedAt.toISOString()
  });

  console.log(`Artifacts: ${runDirectory}`);
  console.log(JSON.stringify(summary.metrics, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
