import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface LatestRun {
  schema_version: "prd2play.latest-run.v1";
  run_id: string;
  run_path: string;
  summary_path: string;
  updated_at: string;
}

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");
const resultsDirectory = resolve(repositoryRoot, "results/sample");

function inside(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return (
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}

function rewriteArtifactPaths(value: string, runPath: string): string {
  const normalized = runPath.replaceAll("\\", "/").replace(/\/$/, "");
  return value.replaceAll(`${normalized}/`, "results/sample/");
}

async function main(): Promise<void> {
  const latestPath = resolve(repositoryRoot, "artifacts/runs/latest.json");
  const latest = JSON.parse(await readFile(latestPath, "utf8")) as LatestRun;
  if (latest.schema_version !== "prd2play.latest-run.v1") {
    throw new Error("Unsupported latest-run pointer");
  }

  const artifactsRoot = resolve(repositoryRoot, "artifacts/runs");
  const runDirectory = resolve(repositoryRoot, latest.run_path);
  if (!inside(artifactsRoot, runDirectory) || runDirectory === artifactsRoot) {
    throw new Error(`Refusing to freeze unsafe run path: ${latest.run_path}`);
  }

  await mkdir(resultsDirectory, { recursive: true });
  for (const file of ["summary.json", "cases.json", "events.jsonl"] as const) {
    const source = resolve(runDirectory, file);
    const target = resolve(resultsDirectory, file);
    const content = rewriteArtifactPaths(
      await readFile(source, "utf8"),
      latest.run_path
    );
    await writeFile(target, content, "utf8");
  }
  await cp(
    resolve(runDirectory, "screenshots"),
    resolve(resultsDirectory, "screenshots"),
    { recursive: true, force: true }
  );
  await writeFile(
    resolve(resultsDirectory, "snapshot-provenance.json"),
    `${JSON.stringify(
      {
        schema_version: "prd2play.snapshot-provenance.v1",
        source_run_id: latest.run_id,
        source_run_updated_at: latest.updated_at,
        copied_files: [
          "summary.json",
          "cases.json",
          "events.jsonl",
          "screenshots/**"
        ],
        secrets_included: false,
        note: "Generated fixture evidence; not a claim about unseen real games or Hy3 model quality."
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`Frozen ${latest.run_id} to results/sample`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
