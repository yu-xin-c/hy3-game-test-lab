import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateGameFromBrief } from "../../src/agents/game-generator";
import {
  GAME_MANIFEST_SCHEMA_VERSION,
  GAME_PACKAGE_SCHEMA_VERSION,
  GENERATED_PRD_SCHEMA_VERSION,
  GeneratedGamePackageSchema,
  SafeGameFilePathSchema,
  USER_BRIEF_SCHEMA_VERSION
} from "../../src/contracts/generation";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

function validPrdResponse(): string {
  return JSON.stringify({
    schema_version: GENERATED_PRD_SCHEMA_VERSION,
    title: "One Coin",
    user_goal: "Start a short game and collect one coin.",
    controls: [
      {
        id: "CTRL_START",
        input: "Click the Start button.",
        behavior: "Change the game from menu to playing."
      },
      {
        id: "CTRL_RIGHT",
        input: "Press ArrowRight.",
        behavior: "Move right and collect the coin."
      }
    ],
    rules: [
      {
        id: "RULE_SCORE",
        statement: "Collecting the coin adds exactly one point."
      }
    ],
    ui: [
      {
        id: "UI_STATUS",
        element: "Status and score HUD",
        behavior: "Show current game status and score."
      }
    ],
    acceptance_criteria: [
      {
        id: "AC_START",
        statement: "The Start button begins the game.",
        evidence: "A real click changes observed status to playing.",
        source_quote: "Use a Start button.",
        source_intent_ids: []
      }
    ],
    assumptions: ["The board contains one coin."]
  });
}

function validGameManifest(): Record<string, unknown> {
  return {
    schema_version: GAME_MANIFEST_SCHEMA_VERSION,
    entry_path: "index.html",
    surface: "dom",
    viewport: { width: 800, height: 600 },
    controls: [
      {
        action_id: "CTRL_START",
        device: "mouse",
        selector: "[data-testid='start']",
        description: "Start through a real click."
      },
      {
        action_id: "CTRL_RIGHT",
        device: "keyboard",
        code: "ArrowRight",
        description: "Move through a real key event."
      }
    ],
    hud_selectors: {
      score: "[data-testid='score']",
      status: "[data-testid='status']"
    },
    state_schema: {
      fields: {
        status: { type: "string", description: "Current game status." },
        score: { type: "integer", description: "Collected score." }
      },
      required: ["status", "score"]
    },
    event_schema: [
      {
        type: "game_started",
        description: "The player started the game.",
        payload_fields: {}
      },
      {
        type: "coin_collected",
        description: "The player collected the coin.",
        payload_fields: {
          score: { type: "integer", description: "Score after collection." }
        }
      }
    ],
    bridge: {
      protocol: "gametestlab/1",
      evidence_only: true,
      actions_via_real_input: true
    }
  };
}

function validGameResponse(gameJs?: string): string {
  const manifest = validGameManifest();
  return JSON.stringify({
    schema_version: GAME_PACKAGE_SCHEMA_VERSION,
    files: [
      {
        path: "index.html",
        content:
          '<!doctype html><link rel="stylesheet" href="./styles.css"><button data-testid="start">Start</button><script src="./game.js"></script>'
      },
      { path: "styles.css", content: "body { color: #fff; }" },
      {
        path: "game.js",
        content:
          gameJs ??
          `let state={status:"menu",score:0};let events=[];
document.querySelector("[data-testid='start']").addEventListener("click",()=>{state.status="playing"});
window.addEventListener("keydown",event=>{if(event.code==="ArrowRight")state.score=1});
window.__GAMETESTLAB__={protocol:"gametestlab/1",isReady:()=>true,reset:()=>{state={status:"menu",score:0};events=[]},observe:()=>({tick:0,status:state.status,state:{...state},latest_event_seq:events.length}),getEvents:({afterSeq})=>events.filter(event=>event.seq>afterSeq)};`
      },
      { path: "game.manifest.json", content: JSON.stringify(manifest) }
    ]
  });
}

describe("generateGameFromBrief", () => {
  it("uses two isolated Hy3 calls and freezes auditable artifacts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "gametestlab-generation-"));
    temporaryRoots.push(outputRoot);
    const calls: Array<{ system: string; user: string }> = [];
    const client = {
      async complete(system: string, user: string) {
        calls.push({ system, user });
        return calls.length === 1 ? validPrdResponse() : validGameResponse();
      }
    };

    const result = await generateGameFromBrief(
      {
        brief: {
          schema_version: USER_BRIEF_SCHEMA_VERSION,
          raw_request:
            "Make a coin game. Use a Start button. RAW_ONLY_CONTEXT_MARKER"
        },
        outputRoot,
        runId: "unit-run"
      },
      client
    );

    expect(calls).toHaveLength(2);
    const firstCall = calls[0];
    const secondCall = calls[1];
    if (!firstCall || !secondCall) throw new Error("expected two calls");
    expect(firstCall.user).toContain("RAW_ONLY_CONTEXT_MARKER");
    expect(firstCall.system).toContain("first of two isolated Hy3 requests");
    expect(secondCall.user).not.toContain("RAW_ONLY_CONTEXT_MARKER");
    expect(secondCall.system).toContain("frozen PRD");

    const frozenPath = resolve(result.outputDirectory, "prd/frozen.json");
    const frozenPrd = await readFile(frozenPath, "utf8");
    const secondInput = JSON.parse(secondCall.user) as {
      frozen_prd_sha256: string;
    };
    expect(secondInput.frozen_prd_sha256).toBe(
      createHash("sha256").update(frozenPrd).digest("hex")
    );
    expect(result.manifest.prd_review_status).toBe("pending");
    expect(result.manifest.secret_fields_persisted).toBe(false);
    expect(result.manifest.calls.map((call) => call.input_basis)).toEqual([
      "user_brief",
      "frozen_prd"
    ]);

    for (const call of result.manifest.calls) {
      const request = await readFile(
        resolve(result.outputDirectory, call.request_file),
        "utf8"
      );
      const response = await readFile(
        resolve(result.outputDirectory, call.response_file),
        "utf8"
      );
      expect(createHash("sha256").update(request).digest("hex")).toBe(
        call.request_sha256
      );
      expect(createHash("sha256").update(response).digest("hex")).toBe(
        call.response_sha256
      );
    }
    await expect(
      readFile(resolve(result.outputDirectory, "game/files/index.html"), "utf8")
    ).resolves.toContain("game.js");
    await expect(
      readFile(
        resolve(result.outputDirectory, "game/files/game.manifest.json"),
        "utf8"
      )
    ).resolves.toContain(GAME_MANIFEST_SCHEMA_VERSION);
  });

  it("allows only the four safe relative package paths", () => {
    for (const unsafePath of [
      "/tmp/index.html",
      "../game.js",
      "nested/../../game.js",
      "C:\\temp\\game.js"
    ]) {
      expect(SafeGameFilePathSchema.safeParse(unsafePath).success).toBe(false);
    }
    expect(SafeGameFilePathSchema.safeParse("game.js").success).toBe(true);
    expect(
      SafeGameFilePathSchema.safeParse("game.manifest.json").success
    ).toBe(true);
  });

  it("rejects a package that does not implement the evidence bridge", () => {
    const parsed = JSON.parse(
      validGameResponse("console.log('no bridge')")
    ) as unknown;
    expect(GeneratedGamePackageSchema.safeParse(parsed).success).toBe(false);
  });
});
