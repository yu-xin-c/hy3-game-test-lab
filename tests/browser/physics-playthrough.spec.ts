import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GameManifestSchema } from "../../src/contracts/generation";
import {
  PrivateOracleSchema,
  PublicCaseSchema
} from "../../src/contracts/schemas";
import { evaluateCase } from "../../src/evaluation/evaluator";
import { runPlaythrough } from "../../src/runtime/playthrough";
import { smokeGeneratedGame } from "../../src/runtime/generated-smoke";

const baseURL = "http://127.0.0.1:4173";
const virtualStartTime = 1_700_000_000_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function createSmokeFixture(gameJs: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gametestlab-smoke-"));
  await Promise.all([
    writeFile(
      resolve(directory, "index.html"),
      '<!doctype html><button id="start">Start</button><script src="./game.js"></script>',
      "utf8"
    ),
    writeFile(resolve(directory, "styles.css"), "body { margin: 0; }", "utf8"),
    writeFile(resolve(directory, "game.js"), gameJs, "utf8"),
    writeFile(resolve(directory, "game.manifest.json"), "{}\n", "utf8")
  ]);
  return directory;
}

const publicCase = PublicCaseSchema.parse({
  schema_version: "gametestlab.case.v2",
  id: "platform-physics-probe",
  title: "Platform physics probe",
  difficulty: {
    level: "D2",
    rationale: "Requires frame-by-frame state and collision checks."
  },
  source: {
    type: "project_authored",
    description: "A deterministic Canvas2D physics fixture.",
    license: "MIT"
  },
  game: {
    entry_path: "/examples/platform-probe/index.html",
    surface: "canvas2d",
    viewport: { width: 800, height: 600 },
    selectors: {
      score: "[data-testid='sim-time']",
      status: "[data-testid='status']",
      surface: "[data-testid='game-canvas']"
    }
  },
  controls: [
    { action_id: "START", device: "mouse", code: "#start-btn" },
    {
      action_id: "RIGHT_DOWN",
      device: "keyboard",
      code: "ArrowRight",
      key_event: "down"
    },
    { action_id: "JUMP", device: "keyboard", code: "Space" },
    {
      action_id: "RIGHT_UP",
      device: "keyboard",
      code: "ArrowRight",
      key_event: "up"
    },
    { action_id: "RESET", device: "keyboard", code: "KeyR" }
  ],
  requirements: [
    {
      id: "RUN-01",
      layer: "L1",
      severity: "must",
      statement: "The game starts in Chromium.",
      observable: ["state.status"]
    },
    {
      id: "PHYS-01",
      layer: "L2",
      severity: "must",
      statement: "A jump lands on platform-1 without passing through it.",
      depends_on: ["RUN-01"],
      observable: ["state.player", "state.platforms"]
    },
    {
      id: "RESET-01",
      layer: "L2",
      severity: "must",
      statement: "Restart returns to the menu and restarts the event sequence.",
      depends_on: ["RUN-01"],
      observable: ["state.status", "event.game_reset"]
    }
  ],
  scenarios: [
    {
      id: "jump-to-platform",
      description: "Hold right, jump, and advance the simulation frame by frame.",
      seed: 17,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "START", checkpoints: ["CP-START"] },
        { kind: "input", action_id: "RIGHT_DOWN" },
        { kind: "input", action_id: "JUMP" },
        {
          kind: "advance_frames",
          frames: 150,
          frame_ms: 8,
          sample_every: 1,
          checkpoints: ["CP-PHYS", "CP-FINAL"]
        },
        { kind: "input", action_id: "RIGHT_UP" },
        { kind: "input", action_id: "RESET", checkpoints: ["CP-RESET"] }
      ]
    }
  ]
});

const oracle = PrivateOracleSchema.parse({
  schema_version: "gametestlab.oracle.v2",
  case_id: publicCase.id,
  scenario_id: "jump-to-platform",
  checkpoints: [
    {
      id: "CP-START",
      action_index: 0,
      layer: "L1",
      requirement_ids: ["RUN-01"],
      expected: { state: { status: "playing" } }
    },
    {
      id: "CP-PHYS",
      action_index: 3,
      layer: "L2",
      requirement_ids: ["PHYS-01"],
      expected: {
        physics: [
          {
            id: "PHYS-NO-PENETRATION",
            type: "no_penetration",
            platform_id: "platform-1"
          },
          {
            id: "PHYS-NO-TUNNELING",
            type: "no_tunneling",
            platform_id: "platform-1"
          },
          {
            id: "PHYS-APEX",
            type: "jump_apex_reaches",
            platform_id: "platform-1"
          },
          {
            id: "PHYS-LANDING",
            type: "eventually_supported",
            platform_id: "platform-1",
            min_consecutive_samples: 2
          },
          {
            id: "PHYS-BOUNDS",
            type: "world_bounds",
            bounds_path: "world"
          }
        ]
      }
    },
    {
      id: "CP-FINAL",
      action_index: 3,
      layer: "L2",
      requirement_ids: ["PHYS-01"],
      terminal: true,
      expected: {
        state: {
          status: "won",
          "player.grounded": true,
          "player.support_id": "platform-1"
        },
        event_types: ["game_won"]
      }
    },
    {
      id: "CP-RESET",
      action_index: 5,
      layer: "L2",
      requirement_ids: ["RESET-01"],
      expected: {
        state: { status: "menu" },
        event_types: ["game_reset"]
      }
    }
  ],
  fault_ground_truth: {
    sample_kind: "clean",
    first_divergence_checkpoint: null,
    root_requirement_id: null,
    root_layer: null,
    error_type: "none",
    final_outcome_correct: true
  }
});

test("virtual frame probes certify a valid platform jump", async ({ page }) => {
  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);
  const physicsTrace = result.trace.find((item) => item.step_kind === "advance_frames");

  expect(physicsTrace?.samples).toHaveLength(151);
  expect(physicsTrace?.samples[0]).toMatchObject({
    frame_index: 0,
    elapsed_ms: 0
  });
  expect(physicsTrace?.samples.at(-1)?.state).toMatchObject({
    status: "won",
    player: { grounded: true, support_id: "platform-1" }
  });
  expect(physicsTrace?.samples.at(-1)?.elapsed_ms).toBeCloseTo(1_200, 5);
  const physicsSamples = physicsTrace?.samples ?? [];
  const tickDeltas = physicsSamples.slice(1).map((sample, index) =>
    sample.tick - (physicsSamples[index]?.tick ?? sample.tick)
  );
  expect(tickDeltas.every((delta) => delta === 0 || delta === 1)).toBe(true);
  expect(result.trace.at(-1)?.game_events.map((event) => event.type))
    .toContain("game_reset");
  expect(result.network.length).toBeGreaterThan(0);
  expect(result.network.every((item) => item.status === 200)).toBe(true);
  expect(evaluation).toMatchObject({
    final_outcome_correct: true,
    process_correct: true,
    gates: { L1: "pass", L2: "pass", L3: "unverified" },
    highest_certified_level: "L2",
    first_failure: null
  });
});

test("the same probe locates a platform tunneling defect", async ({ page }) => {
  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "tunnel"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);

  expect(evaluation.final_outcome_correct).toBe(false);
  expect(evaluation.process_correct).toBe(false);
  expect(evaluation.first_failure).toMatchObject({
    checkpoint_id: "CP-PHYS",
    layer: "L2",
    error_type: "physics_tunneling",
    tick: 41
  });
  expect(evaluation.first_failure?.diffs[0]?.channel).toBe("physics");
  expect(evaluation.first_failure?.frame_index).toBeDefined();
  expect(evaluation.first_failure?.sample_index).toBe(
    (evaluation.first_failure?.frame_index ?? 0) + 3
  );
  expect(evaluation.first_failure?.elapsed_ms).toBe(
    (evaluation.first_failure?.frame_index ?? 0) * 8
  );
});

test("an error from an uncheckpointed input is carried to the next checkpoint", async ({
  page
}) => {
  await page.addInitScript(() => {
    window.addEventListener("keydown", (event) => {
      if (event.code === "ArrowRight") {
        console.error("UNTRACKED_STEP_ERROR");
      }
    });
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);
  const rightTrace = result.trace.find((item) => item.action_id === "RIGHT_DOWN");
  const physicsObservation = result.observations.find(
    (item) => item.checkpoint_id === "CP-PHYS"
  );

  expect(rightTrace?.diagnostics).toEqual([
    expect.objectContaining({
      source: "console",
      message: "UNTRACKED_STEP_ERROR",
      action_index: 1,
      frame_index: null,
      elapsed_ms: 0
    })
  ]);
  expect(physicsObservation?.runtime_error_evidence).toContainEqual(
    expect.objectContaining({
      source: "console",
      action_index: 1,
      elapsed_ms: 0
    })
  );
  expect(evaluation).toMatchObject({
    final_outcome_correct: true,
    process_correct: false,
    lucky_pass_detected: true,
    gates: { L1: "fail", L2: "blocked", L3: "blocked" },
    first_failure: {
      action_index: 1,
      checkpoint_id: "CP-PHYS",
      layer: "L1",
      error_type: "runtime_error",
      elapsed_ms: 0
    }
  });
});

test("a trailing uncheckpointed error cannot disappear from evaluation", async ({
  page
}) => {
  const trailingCase = PublicCaseSchema.parse({
    ...publicCase,
    controls: [
      ...publicCase.controls,
      { action_id: "TAIL_PROBE", device: "keyboard", code: "KeyQ" }
    ],
    scenarios: publicCase.scenarios.map((scenario) => ({
      ...scenario,
      steps: [
        ...scenario.steps,
        { kind: "input", action_id: "TAIL_PROBE" }
      ]
    }))
  });
  await page.addInitScript(() => {
    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyQ") console.error("TRAILING_STEP_ERROR");
    });
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase: trailingCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal"
  });
  const evaluation = evaluateCase(trailingCase, oracle, result.observations);
  const resetObservation = result.observations.find(
    (item) => item.checkpoint_id === "CP-RESET"
  );

  expect(resetObservation?.runtime_error_evidence).toContainEqual(
    expect.objectContaining({
      source: "console",
      action_index: 6,
      message: "console: TRAILING_STEP_ERROR"
    })
  );
  expect(evaluation).toMatchObject({
    final_outcome_correct: true,
    process_correct: false,
    first_failure: {
      action_index: 6,
      checkpoint_id: "CP-RESET",
      layer: "L1",
      error_type: "runtime_error"
    }
  });
});

test("an equal sequence number after reset still yields the new event", async ({
  page
}) => {
  const resetCase = PublicCaseSchema.parse({
    ...publicCase,
    id: "equal-event-reset-probe",
    scenarios: [{
      id: "reset-after-one-event",
      description: "Start once, then reset an event stream whose cursor is one.",
      seed: 17,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "START", checkpoints: ["CP-START"] },
        { kind: "input", action_id: "RESET", checkpoints: ["CP-RESET"] }
      ]
    }]
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase: resetCase,
    scenarioId: "reset-after-one-event",
    fixtureVariant: "normal"
  });

  expect(result.trace[0]?.game_events.map((event) => event.type)).toEqual([
    "game_started"
  ]);
  expect(result.trace[1]?.game_events.map((event) => event.type)).toEqual([
    "game_reset"
  ]);
  expect(result.observations[1]?.event_types).toEqual(["game_reset"]);
});

test("identical consecutive resets remain separate event epochs", async ({ page }) => {
  const resetCase = PublicCaseSchema.parse({
    ...publicCase,
    id: "identical-event-reset-probe",
    scenarios: [{
      id: "reset-twice",
      description: "Reset twice without changing state between resets.",
      seed: 17,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "RESET", checkpoints: ["CP-RESET-1"] },
        { kind: "input", action_id: "RESET", checkpoints: ["CP-RESET-2"] }
      ]
    }]
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase: resetCase,
    scenarioId: "reset-twice",
    fixtureVariant: "normal"
  });

  expect(result.trace.map((item) => item.game_events.map((event) => event.type)))
    .toEqual([["game_reset"], ["game_reset"]]);
  expect(result.trace[1]?.bridge?.event_epoch).toBe(
    (result.trace[0]?.bridge?.event_epoch ?? 0) + 1
  );
});

test("virtual clock setup does not fire page timers before reset", async ({
  page
}) => {
  const setupCase = PublicCaseSchema.parse({
    ...publicCase,
    id: "virtual-clock-setup-probe",
    scenarios: [{
      id: "start-without-time-advance",
      description: "Load and start without advancing the measured clock.",
      seed: 17,
      clock: { mode: "virtual", start_time_ms: virtualStartTime },
      steps: [
        { kind: "input", action_id: "START", checkpoints: ["CP-START"] }
      ]
    }]
  });
  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase: setupCase,
    scenarioId: "start-without-time-advance",
    fixtureVariant: "normal"
  });

  expect(result.observations[0]?.state).toMatchObject({
    initialization_timer_fired_at_reset: false
  });
});

test("a declared setup budget supports asynchronous bridge readiness", async ({
  page
}) => {
  await page.addInitScript(() => {
    let installed: Window["__GAMETESTLAB__"];
    Object.defineProperty(window, "__GAMETESTLAB__", {
      configurable: true,
      get: () => installed,
      set: (bridge: NonNullable<Window["__GAMETESTLAB__"]>) => {
        let asyncReady = false;
        requestAnimationFrame(() => {
          asyncReady = true;
        });
        installed = {
          ...bridge,
          isReady: () => asyncReady && bridge.isReady()
        };
      }
    });
  });
  const setupCase = PublicCaseSchema.parse({
    ...publicCase,
    id: "async-ready-setup-probe",
    scenarios: [{
      id: "async-ready",
      description: "Advance a declared setup budget before measured reset.",
      seed: 17,
      clock: {
        mode: "virtual",
        start_time_ms: virtualStartTime,
        setup_ms: 32
      },
      steps: [{ kind: "input", action_id: "START", checkpoints: ["CP-START"] }]
    }]
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase: setupCase,
    scenarioId: "async-ready",
    fixtureVariant: "normal"
  });

  expect(result.diagnostics).toEqual([]);
  expect(result.observations[0]?.state).toMatchObject({
    status: "playing",
    initialization_timer_fired_at_reset: true
  });
});

test("a stalled bridge reset is bounded by the hard timeout", async ({ page }) => {
  await page.addInitScript(() => {
    let installed: Window["__GAMETESTLAB__"];
    Object.defineProperty(window, "__GAMETESTLAB__", {
      configurable: true,
      get: () => installed,
      set: (bridge: NonNullable<Window["__GAMETESTLAB__"]>) => {
        installed = {
          ...bridge,
          reset: async () => await new Promise<never>(() => {})
        };
      }
    });
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal",
    actionTimeoutMs: 75
  });

  expect(result.diagnostics).toContainEqual(expect.objectContaining({
    source: "runner",
    message: expect.stringContaining("bridge.reset() timed out after 75 ms")
  }));
  expect(result.observations[0]?.runtime_errors).toContainEqual(
    expect.stringContaining("bridge.reset() timed out after 75 ms")
  );
});

test("touch controls run in a touch-enabled context", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: publicCase.game.viewport
  });
  try {
    const page = await context.newPage();
    const touchCase = PublicCaseSchema.parse({
      ...publicCase,
      id: "touch-context-probe",
      controls: [{
        action_id: "START",
        device: "touch",
        selector: "#start-btn"
      }],
      scenarios: [{
        id: "touch-start",
        description: "Start the game through a real touch input.",
        seed: 17,
        clock: { mode: "virtual", start_time_ms: virtualStartTime },
        steps: [{ kind: "input", action_id: "START", checkpoints: ["CP-START"] }]
      }]
    });

    const result = await runPlaythrough({
      page,
      baseURL,
      publicCase: touchCase,
      scenarioId: "touch-start",
      fixtureVariant: "normal"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.observations[0]?.state).toMatchObject({ status: "playing" });
  } finally {
    await context.close();
  }
});

test("a successful cross-origin resource still fails the reproducibility gate", async ({
  page
}) => {
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.__REMOTE_DEPENDENCY_LOADED__ = true;"
    })
  );
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const script = document.createElement("script");
      script.src = "https://cdn.example/dependency.js";
      document.head.append(script);
    });
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);

  expect(result.network).toContainEqual(expect.objectContaining({
    kind: "response",
    url: "https://cdn.example/dependency.js",
    status: 200
  }));
  expect(evaluation).toMatchObject({
    final_outcome_correct: true,
    process_correct: false,
    gates: { L1: "fail", L2: "blocked", L3: "blocked" },
    first_failure: {
      layer: "L1",
      error_type: "runtime_error"
    }
  });
});

test("a pending cross-origin request fails as soon as it starts", async ({ page }) => {
  await page.route("https://pending.example/**", () => {
    // Deliberately leave the request pending. The request-start probe must be
    // sufficient; waiting for response/requestfailed would miss this case.
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      void fetch("https://pending.example/never");
    });
  });

  const result = await runPlaythrough({
    page,
    baseURL,
    publicCase,
    scenarioId: oracle.scenario_id,
    fixtureVariant: "normal"
  });
  const evaluation = evaluateCase(publicCase, oracle, result.observations);

  expect(result.network).toContainEqual(expect.objectContaining({
    kind: "request",
    url: "https://pending.example/never"
  }));
  expect(evaluation.gates).toEqual({ L1: "fail", L2: "blocked", L3: "blocked" });
});

test("generated-game smoke gate calls the real bridge in isolated Chromium", async () => {
  const smoke = await smokeGeneratedGame({
    gameDirectory: resolve(repositoryRoot, "examples/platform-probe"),
    manifest: GameManifestSchema.parse({
      schema_version: "gametestlab.game-manifest.v3",
      entry_path: "index.html",
      surface: "canvas2d",
      viewport: { width: 800, height: 600 },
      controls: [{
        action_id: "START",
        device: "touch",
        selector: "#start-btn",
        description: "Start the game"
      }],
      hud_selectors: { status: "[data-testid='status']" },
      state_schema: {
        fields: { status: { type: "string", description: "Game status" } },
        required: ["status"]
      },
      event_schema: [{
        type: "game_reset",
        description: "Game reset",
        payload_fields: {}
      }],
      bridge: {
        protocol: "gametestlab/2",
        evidence_only: true,
        actions_via_real_input: true
      }
    })
  });

  expect(smoke.passed).toBe(true);
  expect(smoke.event_epochs[1]).toBeGreaterThan(smoke.event_epochs[0]);
  expect(smoke.exercised_control_ids).toEqual(["START"]);
});

test("generated-game smoke rejects an event from a future game tick", async () => {
  const gameDirectory = await createSmokeFixture(`
let epoch = 0;
let events = [];
document.querySelector("#start").addEventListener("click", () => {});
window.__GAMETESTLAB__ = {
  protocol: "gametestlab/2",
  isReady: () => true,
  reset: () => {
    epoch += 1;
    events = [{ seq: 1, tick: 2, type: "game_reset" }];
  },
  observe: () => ({
    tick: 1,
    status: "menu",
    state: { status: "menu" },
    event_epoch: epoch,
    latest_event_seq: events.length
  }),
  getEvents: ({ afterSeq }) => events.filter((event) => event.seq > afterSeq)
};
`);
  try {
    const manifest = GameManifestSchema.parse({
      schema_version: "gametestlab.game-manifest.v3",
      entry_path: "index.html",
      surface: "dom",
      viewport: { width: 320, height: 240 },
      controls: [{
        action_id: "START",
        device: "mouse",
        selector: "#start",
        description: "Start the game"
      }],
      hud_selectors: { status: "#start" },
      state_schema: {
        fields: { status: { type: "string", description: "Game status" } },
        required: ["status"]
      },
      event_schema: [{
        type: "game_reset",
        description: "Game reset",
        payload_fields: {}
      }],
      bridge: {
        protocol: "gametestlab/2",
        evidence_only: true,
        actions_via_real_input: true
      }
    });

    await expect(smokeGeneratedGame({ gameDirectory, manifest })).rejects.toThrow(
      "smoke: bridge event tick exceeds observation tick"
    );
  } finally {
    await rm(gameDirectory, { recursive: true, force: true });
  }
});

test("generated-game smoke catches a request triggered by real input", async () => {
  const gameDirectory = await createSmokeFixture(`
let epoch = 0;
let tick = 0;
let status = "menu";
let events = [];
document.querySelector("#start").addEventListener("click", () => {
  status = "playing";
  tick += 1;
  events.push({ seq: events.length + 1, tick, type: "game_started" });
  void fetch("https://interaction.invalid/probe");
});
window.__GAMETESTLAB__ = {
  protocol: "gametestlab/2",
  isReady: () => true,
  reset: () => {
    epoch += 1;
    tick = 0;
    status = "menu";
    events = [];
  },
  observe: () => ({
    tick,
    status,
    state: { status },
    event_epoch: epoch,
    latest_event_seq: events.length
  }),
  getEvents: ({ afterSeq }) => events.filter((event) => event.seq > afterSeq)
};
`);
  try {
    const manifest = GameManifestSchema.parse({
      schema_version: "gametestlab.game-manifest.v3",
      entry_path: "index.html",
      surface: "dom",
      viewport: { width: 320, height: 240 },
      controls: [{
        action_id: "START",
        device: "mouse",
        selector: "#start",
        description: "Start the game"
      }],
      hud_selectors: { status: "#start" },
      state_schema: {
        fields: { status: { type: "string", description: "Game status" } },
        required: ["status"]
      },
      event_schema: [{
        type: "game_started",
        description: "Game started",
        payload_fields: {}
      }],
      bridge: {
        protocol: "gametestlab/2",
        evidence_only: true,
        actions_via_real_input: true
      }
    });

    await expect(smokeGeneratedGame({ gameDirectory, manifest })).rejects.toThrow(
      "external request: https://interaction.invalid/probe"
    );
  } finally {
    await rm(gameDirectory, { recursive: true, force: true });
  }
});
