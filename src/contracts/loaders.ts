import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DatasetManifestSchema,
  PrivateOracleSchema,
  PublicCaseSchema,
  type DatasetManifest,
  type PrivateOracle,
  type PublicCase
} from "./schemas";

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
  const publicCase = await loadCase(resolve(repositoryRoot, entry.case_file));
  const oracle = await loadOracle(resolve(repositoryRoot, entry.oracle_file));
  if (publicCase.id !== oracle.case_id) {
    throw new Error(
      `Case/oracle mismatch: ${publicCase.id} != ${oracle.case_id}`
    );
  }
  return { publicCase, oracle };
}

