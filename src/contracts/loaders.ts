import { readFile } from "node:fs/promises";
import {
  DatasetManifestSchema,
  PrivateOracleSchema,
  PublicCaseSchema,
  type DatasetManifest,
  type PrivateOracle,
  type PublicCase
} from "./schemas";
import { resolveRegularFileInsideRoot } from "./paths";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function loadManifest(path: string): Promise<DatasetManifest> {
  return DatasetManifestSchema.parse(await readJson(path));
}

export async function loadCase(path: string): Promise<PublicCase> {
  return PublicCaseSchema.parse(await readJson(path));
}

export async function loadOracle(path: string): Promise<PrivateOracle> {
  return PrivateOracleSchema.parse(await readJson(path));
}

export async function loadDatasetEntry(
  repositoryRoot: string,
  entry: DatasetManifest["cases"][number]
): Promise<{ publicCase: PublicCase; oracle: PrivateOracle }> {
  const [casePath, oraclePath] = await Promise.all([
    resolveRegularFileInsideRoot(repositoryRoot, entry.case_file, {
      rejectSymlink: true
    }),
    resolveRegularFileInsideRoot(repositoryRoot, entry.oracle_file, {
      rejectSymlink: true
    })
  ]);
  const publicCase = await loadCase(casePath);
  const oracle = await loadOracle(oraclePath);
  if (publicCase.id !== oracle.case_id) {
    throw new Error(
      `Case/oracle mismatch: ${publicCase.id} != ${oracle.case_id}`
    );
  }
  return { publicCase, oracle };
}
