import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GameTaskOracleSchema,
  GameTaskPlanSchema,
  type GameTaskOracle,
  type GameTaskPlan
} from "../../src/contracts/game-tasks";
import {
  GAME_MANIFEST_SCHEMA_VERSION,
  GameManifestSchema,
  type GameManifest
} from "../../src/contracts/generation";
import {
  adaptGameTask,
  assertGameManifestMatchesTask
} from "../../src/contracts/task-adapter";

async function loadTask(id: string, archived = false): Promise<{
  plan: GameTaskPlan;
  oracle: GameTaskOracle;
}> {
  const directory = fileURLToPath(
    new URL(`../../datasets/${archived ? "archived-camera-tasks" : "game-tasks"}/${id}/`, import.meta.url)
  );
  const [planText, oracleText] = await Promise.all([
    readFile(`${directory}test-plan.json`, "utf8"),
    readFile(`${directory}oracle.private.json`, "utf8")
  ]);
  return {
    plan: GameTaskPlanSchema.parse(JSON.parse(planText) as unknown),
    oracle: GameTaskOracleSchema.parse(JSON.parse(oracleText) as unknown)
  };
}

function matchingManifest(
  plan: GameTaskPlan,
  oracle: GameTaskOracle
): GameManifest {
  const stateFields = new Set(
    oracle.scenarios.flatMap((scenario) =>
      scenario.checkpoints.flatMap((checkpoint) =>
        Object.keys(checkpoint.expected.state).map((path) => path.split(".")[0] ?? path)
      )
    )
  );
  const eventTypes = new Set(
    oracle.scenarios.flatMap((scenario) =>
      scenario.checkpoints.flatMap((checkpoint) => checkpoint.expected.event_types)
    )
  );
  return GameManifestSchema.parse({
    schema_version: GAME_MANIFEST_SCHEMA_VERSION,
    entry_path: "index.html",
    surface: plan.surface,
    viewport: plan.viewport,
    controls: plan.controls.map((control) => ({
      ...control,
      description: control.action_id
    })),
    hud_selectors: {
      score: plan.selectors.score,
      status: plan.selectors.status
    },
    state_schema: {
      fields: Object.fromEntries([...stateFields].map((field) => [field, {
        type: "object",
        description: field
      }])),
      required: [...stateFields]
    },
    event_schema: [...eventTypes].map((type) => ({
      type,
      description: type,
      payload_fields: {}
    })),
    bridge: {
      protocol: "gametestlab/2",
      evidence_only: true,
      actions_via_real_input: true
    }
  });
}

describe("formal game task adapter", () => {
  it("adapts a persistence task with a real reload step", async () => {
    const { plan, oracle } = await loadTask("persistent-2048");
    const adapted = adaptGameTask(plan, oracle, matchingManifest(plan, oracle));
    expect(adapted.publicCase.schema_version).toBe("gametestlab.case.v3");
    expect(adapted.publicCase.scenarios[0]?.steps.some(
      (step) => step.kind === "reload"
    )).toBe(true);
    expect(adapted.scenarioOracles).toHaveLength(3);
  });

  it("preserves camera fixtures and multiplayer actors", async () => {
    const cameraTask = await loadTask("gesture-goalie", true);
    const cameraAdapted = adaptGameTask(
      cameraTask.plan,
      cameraTask.oracle,
      matchingManifest(cameraTask.plan, cameraTask.oracle)
    );
    expect(cameraAdapted.publicCase.controls.some(
      (control) => control.device === "camera" && control.fixture_frame === "left-pose"
    )).toBe(true);

    const multiplayerTask = await loadTask("dual-arena");
    const multiplayerAdapted = adaptGameTask(
      multiplayerTask.plan,
      multiplayerTask.oracle,
      matchingManifest(multiplayerTask.plan, multiplayerTask.oracle)
    );
    expect(multiplayerAdapted.publicCase.controls.some(
      (control) => control.actor === "secondary"
    )).toBe(true);
  });

  it("rejects a generated manifest that omits expected evidence", async () => {
    const { plan, oracle } = await loadTask("target-rush");
    const manifest = matchingManifest(plan, oracle);
    const broken = GameManifestSchema.parse({
      ...manifest,
      event_schema: manifest.event_schema.filter(
        (event) => event.type !== "game_won"
      )
    });
    expect(() => assertGameManifestMatchesTask(plan, oracle, broken)).toThrow(
      "event schema is missing game_won"
    );
  });
});
