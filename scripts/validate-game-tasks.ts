import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GameTaskOracleSchema,
  GameTaskPlanSchema,
  GameTaskSetManifestSchema,
  type GameTaskOracle,
  type GameTaskPlan
} from "../src/contracts/game-tasks";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const taskRoot = resolve(repositoryRoot, "datasets/game-tasks");

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate IDs`);
  }
}

function validateReferences(plan: GameTaskPlan, oracle: GameTaskOracle): void {
  const controls = new Set(plan.controls.map((control) => control.action_id));
  const requirements = new Map(
    plan.requirements.map((requirement) => [requirement.id, requirement])
  );
  const planScenarios = new Map(plan.scenarios.map((scenario) => [scenario.id, scenario]));
  const oracleScenarios = new Map(
    oracle.scenarios.map((scenario) => [scenario.scenario_id, scenario])
  );

  assertUnique(plan.controls.map((control) => control.action_id), `${plan.task_id} controls`);
  assertUnique(plan.requirements.map((requirement) => requirement.id), `${plan.task_id} requirements`);
  assertUnique(plan.scenarios.map((scenario) => scenario.id), `${plan.task_id} scenarios`);
  assertUnique(
    oracle.scenarios.map((scenario) => scenario.scenario_id),
    `${plan.task_id} oracle scenarios`
  );
  for (const requirement of plan.requirements) {
    for (const dependency of requirement.depends_on) {
      if (!requirements.has(dependency)) {
        throw new Error(`${plan.task_id}/${requirement.id} depends on ${dependency}`);
      }
    }
  }
  if (plan.features.includes("multiplayer") !== (plan.environment.pages === 2)) {
    throw new Error(`${plan.task_id} multiplayer feature/pages disagree`);
  }
  if (plan.features.includes("camera") !== plan.environment.fake_camera) {
    throw new Error(`${plan.task_id} camera feature/environment disagree`);
  }
  if (plan.features.includes("persistence") !== plan.environment.persistent_storage) {
    throw new Error(`${plan.task_id} persistence feature/environment disagree`);
  }
  if (
    plan.controls.some((control) => control.actor === "secondary") &&
    plan.environment.pages !== 2
  ) {
    throw new Error(`${plan.task_id} secondary controls require two pages`);
  }

  for (const requiredScenario of ["win-path", "loss-path", "restart-path"]) {
    if (!planScenarios.has(requiredScenario)) {
      throw new Error(`${plan.task_id} is missing ${requiredScenario}`);
    }
  }
  if (planScenarios.size !== oracleScenarios.size) {
    throw new Error(`${plan.task_id} plan/oracle scenario counts differ`);
  }

  const coveredRequirements = new Set<string>();
  const allCheckpointIds: string[] = [];
  for (const [scenarioId, scenario] of planScenarios) {
    const scenarioOracle = oracleScenarios.get(scenarioId);
    if (!scenarioOracle) {
      throw new Error(`${plan.task_id} oracle is missing scenario ${scenarioId}`);
    }
    const stepByCheckpoint = new Map<string, number>();
    scenario.steps.forEach((step, actionIndex) => {
      if (step.kind === "input" && !controls.has(step.action_id)) {
        throw new Error(
          `${plan.task_id}/${scenarioId} uses unknown action ${step.action_id}`
        );
      }
      if (step.kind === "reload" && !plan.environment.persistent_storage) {
        throw new Error(`${plan.task_id}/${scenarioId} reload requires persistence`);
      }
      for (const checkpointId of step.checkpoints) {
        if (stepByCheckpoint.has(checkpointId)) {
          throw new Error(`${plan.task_id} repeats checkpoint ${checkpointId}`);
        }
        stepByCheckpoint.set(checkpointId, actionIndex);
        allCheckpointIds.push(checkpointId);
      }
    });
    if ((scenario.steps.at(-1)?.checkpoints.length ?? 0) === 0) {
      throw new Error(`${plan.task_id}/${scenarioId} must end with a checkpoint`);
    }

    const oracleIds = scenarioOracle.checkpoints.map((checkpoint) => checkpoint.id);
    assertUnique(oracleIds, `${plan.task_id}/${scenarioId} oracle checkpoints`);
    if (oracleIds.length !== stepByCheckpoint.size) {
      throw new Error(`${plan.task_id}/${scenarioId} checkpoint counts differ`);
    }
    for (const checkpoint of scenarioOracle.checkpoints) {
      const actionIndex = stepByCheckpoint.get(checkpoint.id);
      if (actionIndex === undefined || actionIndex !== checkpoint.action_index) {
        throw new Error(
          `${plan.task_id}/${checkpoint.id} has the wrong action_index`
        );
      }
      for (const requirementId of checkpoint.requirement_ids) {
        const requirement = requirements.get(requirementId);
        if (!requirement) {
          throw new Error(`${plan.task_id}/${checkpoint.id} references ${requirementId}`);
        }
        if (requirement.layer !== checkpoint.layer) {
          throw new Error(`${plan.task_id}/${checkpoint.id} has a layer mismatch`);
        }
        coveredRequirements.add(requirementId);
      }
    }
    const terminalCheckpoints = scenarioOracle.checkpoints.filter(
      (checkpoint) => checkpoint.terminal
    );
    if (terminalCheckpoints.length !== 1) {
      throw new Error(`${plan.task_id}/${scenarioId} needs a terminal checkpoint`);
    }
    if (terminalCheckpoints[0]?.action_index !== scenario.steps.length - 1) {
      throw new Error(`${plan.task_id}/${scenarioId} terminal checkpoint must be last`);
    }
  }
  assertUnique(allCheckpointIds, `${plan.task_id} checkpoints`);

  const physicsIds = oracle.scenarios.flatMap((scenario) =>
    scenario.checkpoints.flatMap((checkpoint) =>
      checkpoint.expected.physics.map((invariant) => invariant.id)
    )
  );
  assertUnique(physicsIds, `${plan.task_id} physics invariants`);

  for (const requirement of plan.requirements) {
    if (requirement.severity === "must" && !coveredRequirements.has(requirement.id)) {
      throw new Error(`${plan.task_id} does not test must requirement ${requirement.id}`);
    }
  }
}

async function validateHashes(
  directory: string,
  contractPath: string
): Promise<void> {
  const inputs: Array<readonly [string, string]> = [
    ["brief.md", resolve(directory, "brief.md")],
    ["test-plan.json", resolve(directory, "test-plan.json")],
    ["oracle.private.json", resolve(directory, "oracle.private.json")],
    ["../GAME_CONTRACT.md", contractPath]
  ];
  const expectedEntries = await Promise.all(
    inputs.map(async ([label, path]) => `${await sha256(path)}  ${label}`)
  );
  const stored = (await readFile(resolve(directory, "input-sha256.txt"), "utf8"))
    .trim()
    .split(/\r?\n/);
  if (stored.join("\n") !== expectedEntries.join("\n")) {
    throw new Error(`${directory} input-sha256.txt is stale`);
  }
}

async function main(): Promise<void> {
  const manifest = GameTaskSetManifestSchema.parse(
    await readJson(resolve(taskRoot, "manifest.json"))
  );
  const contractPath = resolve(taskRoot, manifest.contract_file);
  const contract = await readFile(contractPath, "utf8");
  if (!contract.includes("gametestlab/2")) {
    throw new Error("GAME_CONTRACT.md must require gametestlab/2");
  }

  const counts = { D1: 0, D2: 0, D3: 0 };
  const categoryCounts = {
    action: 0,
    puzzle: 0,
    creative: 0,
    simulation: 0,
    education: 0
  };
  const featureCounts = {
    "3d": 0,
    camera: 0,
    multiplayer: 0,
    persistence: 0,
    leaderboard: 0,
    touch: 0
  };
  for (const entry of manifest.tasks) {
    const directory = resolve(taskRoot, entry.directory);
    const brief = await readFile(resolve(directory, "brief.md"), "utf8");
    for (const heading of ["## 游戏目标", "## 完整玩法", "## 胜负与重开", "## 界面与反馈"]) {
      if (!brief.includes(heading)) {
        throw new Error(`${entry.id}/brief.md is missing ${heading}`);
      }
    }
    const plan = GameTaskPlanSchema.parse(
      await readJson(resolve(directory, "test-plan.json"))
    );
    const oracle = GameTaskOracleSchema.parse(
      await readJson(resolve(directory, "oracle.private.json"))
    );
    if (
      plan.task_id !== entry.id ||
      oracle.task_id !== entry.id ||
      plan.difficulty.level !== entry.difficulty ||
      plan.category !== entry.category ||
      [...plan.features].sort().join(",") !== [...entry.features].sort().join(",")
    ) {
      throw new Error(`${entry.id} manifest, plan, and oracle disagree`);
    }
    validateReferences(plan, oracle);
    await validateHashes(directory, contractPath);
    counts[entry.difficulty] += 1;
    categoryCounts[entry.category] += 1;
    for (const feature of entry.features) featureCounts[feature] += 1;
  }

  const expectedCategories = { action: 31, puzzle: 26, creative: 13, simulation: 16, education: 10 };
  const expectedFeatures = { "3d": 13, camera: 0, multiplayer: 15, persistence: 13, leaderboard: 10, touch: 6 };
  if (JSON.stringify(categoryCounts) !== JSON.stringify(expectedCategories)) {
    throw new Error(`category distribution mismatch: ${JSON.stringify(categoryCounts)}`);
  }
  if (JSON.stringify(featureCounts) !== JSON.stringify(expectedFeatures)) {
    throw new Error(`feature distribution mismatch: ${JSON.stringify(featureCounts)}`);
  }

  console.log(
    `Game tasks valid: ${manifest.tasks.length}; difficulty ${JSON.stringify(counts)}; categories ${JSON.stringify(categoryCounts)}; features ${JSON.stringify(featureCounts)}`
  );
}

await main();
