import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDatasetEntry, loadManifest } from "../src/contracts/loaders";
import type {
  DatasetManifest,
  Difficulty,
  PrivateOracle,
  PublicCase
} from "../src/contracts/schemas";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(scriptPath, "../..");

export interface DatasetValidationSummary {
  case_count: number;
  difficulty_counts: Record<Difficulty, number>;
  sample_kind_counts: Record<"clean" | "faulty" | "lucky_pass", number>;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function addDuplicateErrors(
  errors: string[],
  caseId: string,
  label: string,
  values: string[]
): void {
  for (const value of duplicates(values)) {
    errors.push(`${caseId}: duplicate ${label} '${value}'`);
  }
}

function findDependencyCycle(publicCase: PublicCase): string[] | null {
  const requirements = new Map(
    publicCase.requirements.map((requirement) => [requirement.id, requirement])
  );
  const active = new Set<string>();
  const complete = new Set<string>();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    if (complete.has(id)) return null;
    if (active.has(id)) {
      const start = path.indexOf(id);
      return [...path.slice(start), id];
    }
    const requirement = requirements.get(id);
    if (!requirement) return null;

    active.add(id);
    path.push(id);
    for (const dependency of requirement.depends_on) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    active.delete(id);
    complete.add(id);
    return null;
  };

  for (const id of requirements.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function validateEntry(
  publicCase: PublicCase,
  oracle: PrivateOracle,
  errors: string[]
): void {
  const caseId = publicCase.id;
  const controlIds = publicCase.controls.map((control) => control.action_id);
  const requirementIds = publicCase.requirements.map(
    (requirement) => requirement.id
  );
  const scenarioIds = publicCase.scenarios.map((scenario) => scenario.id);
  const checkpointIds = oracle.checkpoints.map((checkpoint) => checkpoint.id);
  const controlIdSet = new Set(controlIds);
  const requirementById = new Map(
    publicCase.requirements.map((requirement) => [requirement.id, requirement])
  );

  addDuplicateErrors(errors, caseId, "control action_id", controlIds);
  addDuplicateErrors(errors, caseId, "requirement id", requirementIds);
  addDuplicateErrors(errors, caseId, "scenario id", scenarioIds);
  addDuplicateErrors(errors, caseId, "oracle checkpoint id", checkpointIds);

  for (const requirement of publicCase.requirements) {
    for (const dependency of requirement.depends_on) {
      if (!requirementById.has(dependency)) {
        errors.push(
          `${caseId}: requirement '${requirement.id}' depends on unknown requirement '${dependency}'`
        );
      }
      if (dependency === requirement.id) {
        errors.push(`${caseId}: requirement '${requirement.id}' depends on itself`);
      }
    }
  }
  const cycle = findDependencyCycle(publicCase);
  if (cycle) {
    errors.push(`${caseId}: cyclic requirement dependency ${cycle.join(" -> ")}`);
  }

  const selectedScenario = publicCase.scenarios.find(
    (scenario) => scenario.id === oracle.scenario_id
  );
  if (!selectedScenario) {
    errors.push(
      `${caseId}: oracle references unknown scenario '${oracle.scenario_id}'`
    );
    return;
  }

  const scenarioCheckpointIds: string[] = [];
  selectedScenario.steps.forEach((step, actionIndex) => {
    if (!controlIdSet.has(step.action_id)) {
      errors.push(
        `${caseId}: scenario '${selectedScenario.id}' uses unknown action '${step.action_id}' at index ${actionIndex}`
      );
    }
    scenarioCheckpointIds.push(...step.checkpoints);
  });
  addDuplicateErrors(
    errors,
    caseId,
    `checkpoint reference in scenario '${selectedScenario.id}'`,
    scenarioCheckpointIds
  );

  const checkpointById = new Map(
    oracle.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint])
  );
  for (const checkpointId of scenarioCheckpointIds) {
    if (!checkpointById.has(checkpointId)) {
      errors.push(
        `${caseId}: scenario references unknown checkpoint '${checkpointId}'`
      );
    }
  }
  const scenarioCheckpointSet = new Set(scenarioCheckpointIds);
  for (const checkpoint of oracle.checkpoints) {
    if (!scenarioCheckpointSet.has(checkpoint.id)) {
      errors.push(
        `${caseId}: oracle checkpoint '${checkpoint.id}' is not referenced by the selected scenario`
      );
    }
    if (checkpoint.action_index >= selectedScenario.steps.length) {
      errors.push(
        `${caseId}: checkpoint '${checkpoint.id}' action_index ${checkpoint.action_index} is out of range`
      );
    } else if (
      !selectedScenario.steps[checkpoint.action_index]?.checkpoints.includes(
        checkpoint.id
      )
    ) {
      errors.push(
        `${caseId}: checkpoint '${checkpoint.id}' is not attached to scenario action_index ${checkpoint.action_index}`
      );
    }
    for (const requirementId of checkpoint.requirement_ids) {
      const requirement = requirementById.get(requirementId);
      if (!requirement) {
        errors.push(
          `${caseId}: checkpoint '${checkpoint.id}' references unknown requirement '${requirementId}'`
        );
      } else if (requirement.layer !== checkpoint.layer) {
        errors.push(
          `${caseId}: checkpoint '${checkpoint.id}' layer ${checkpoint.layer} does not match requirement '${requirementId}' layer ${requirement.layer}`
        );
      }
    }
  }

  const terminalCount = oracle.checkpoints.filter(
    (checkpoint) => checkpoint.terminal
  ).length;
  if (terminalCount !== 1) {
    errors.push(`${caseId}: expected exactly one terminal checkpoint, got ${terminalCount}`);
  }

  const truth = oracle.fault_ground_truth;
  if (truth.sample_kind === "clean") {
    if (
      truth.first_divergence_checkpoint !== null ||
      truth.root_requirement_id !== null ||
      truth.root_layer !== null ||
      truth.error_type !== "none"
    ) {
      errors.push(`${caseId}: clean sample must have null fault location and error_type 'none'`);
    }
  } else {
    if (!truth.first_divergence_checkpoint) {
      errors.push(`${caseId}: non-clean sample is missing first divergence checkpoint`);
    } else if (!checkpointById.has(truth.first_divergence_checkpoint)) {
      errors.push(
        `${caseId}: first divergence '${truth.first_divergence_checkpoint}' is not an oracle checkpoint`
      );
    }
    if (!truth.root_requirement_id) {
      errors.push(`${caseId}: non-clean sample is missing root requirement`);
    } else {
      const rootRequirement = requirementById.get(truth.root_requirement_id);
      if (!rootRequirement) {
        errors.push(
          `${caseId}: root requirement '${truth.root_requirement_id}' does not exist`
        );
      } else if (rootRequirement.layer !== truth.root_layer) {
        errors.push(
          `${caseId}: root layer ${String(truth.root_layer)} does not match requirement '${truth.root_requirement_id}' layer ${rootRequirement.layer}`
        );
      }
    }
    if (truth.error_type === "none") {
      errors.push(`${caseId}: non-clean sample cannot use error_type 'none'`);
    }
  }
}

export async function validateDataset(
  repositoryRoot = defaultRepositoryRoot,
  manifestFile = "datasets/manifest.json"
): Promise<DatasetValidationSummary> {
  const manifestPath = resolve(repositoryRoot, manifestFile);
  const manifest: DatasetManifest = await loadManifest(manifestPath);
  const errors: string[] = [];
  const seenCaseIds = new Set<string>();
  const difficultyCounts: DatasetValidationSummary["difficulty_counts"] = {
    D1: 0,
    D2: 0,
    D3: 0
  };
  const sampleKindCounts: DatasetValidationSummary["sample_kind_counts"] = {
    clean: 0,
    faulty: 0,
    lucky_pass: 0
  };

  addDuplicateErrors(
    errors,
    "manifest",
    "case_file",
    manifest.cases.map((entry) => entry.case_file)
  );
  addDuplicateErrors(
    errors,
    "manifest",
    "oracle_file",
    manifest.cases.map((entry) => entry.oracle_file)
  );
  addDuplicateErrors(
    errors,
    "manifest",
    "fixture_variant",
    manifest.cases.map((entry) => entry.fixture_variant)
  );

  for (const entry of manifest.cases) {
    try {
      const { publicCase, oracle } = await loadDatasetEntry(
        repositoryRoot,
        entry
      );
      if (seenCaseIds.has(publicCase.id)) {
        errors.push(`manifest: duplicate loaded case id '${publicCase.id}'`);
      }
      seenCaseIds.add(publicCase.id);
      difficultyCounts[publicCase.difficulty.level] += 1;
      sampleKindCounts[oracle.fault_ground_truth.sample_kind] += 1;
      validateEntry(publicCase, oracle, errors);
    } catch (error) {
      errors.push(
        `${entry.case_file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (const difficulty of ["D1", "D2", "D3"] as const) {
    if (difficultyCounts[difficulty] === 0) {
      errors.push(`dataset does not cover difficulty ${difficulty}`);
    }
  }
  if (sampleKindCounts.clean === 0) {
    errors.push("dataset must contain at least one clean sample");
  }
  if (sampleKindCounts.lucky_pass === 0) {
    errors.push("dataset must contain at least one lucky-pass sample");
  }

  if (errors.length > 0) {
    throw new Error(
      `Dataset validation failed with ${errors.length} issue(s):\n- ${errors.join("\n- ")}`
    );
  }

  return {
    case_count: manifest.cases.length,
    difficulty_counts: difficultyCounts,
    sample_kind_counts: sampleKindCounts
  };
}

async function main(): Promise<void> {
  const summary = await validateDataset();
  process.stdout.write(
    `Dataset valid: ${summary.case_count} cases; difficulty ${JSON.stringify(summary.difficulty_counts)}; sample kinds ${JSON.stringify(summary.sample_kind_counts)}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
