import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  GENERATED_PRD_SCHEMA_VERSION,
  GAME_MANIFEST_SCHEMA_VERSION,
  GAME_PACKAGE_FILE_ALLOWLIST,
  GAME_PACKAGE_SCHEMA_VERSION,
  GENERATION_RUN_SCHEMA_VERSION,
  GeneratedGamePackageSchema,
  GeneratedPrdSchema,
  GenerationRunManifestSchema,
  UserBriefSchema,
  gameManifestFromPackage,
  type GeneratedGamePackage,
  type GeneratedPrd,
  type GenerationRunManifest,
  type UserBrief,
  type UserBriefInput
} from "../contracts/generation";
import { Hy3Client } from "../llm/hy3-client";

const PRD_SYSTEM_PROMPT = `You are the product-definition stage of PRD2Play.
Turn the user's raw browser-game request into a precise, testable PRD. This is
the first of two isolated Hy3 requests: do not write game code and do not claim
that anything has been implemented or tested. Preserve ambiguity as an explicit
assumption rather than silently inventing a requirement.

Return exactly one JSON object and no prose. It must have this shape:
{
  "schema_version": "${GENERATED_PRD_SCHEMA_VERSION}",
  "title": "...",
  "user_goal": "...",
  "controls": [{"id":"CTRL_START","input":"...","behavior":"..."}],
  "rules": [{"id":"RULE_01","statement":"..."}],
  "ui": [{"id":"UI_01","element":"...","behavior":"..."}],
  "acceptance_criteria": [{
    "id":"AC_01","statement":"...","evidence":"...",
    "source_quote":"an exact quote from raw_request",
    "source_intent_ids":[]
  }],
  "assumptions": ["..."]
}
Every acceptance criterion must be traceable through an exact source_quote or
one or more IDs supplied in source_intents. Include user goal, controls, rules,
UI behavior, acceptance criteria, and assumptions.`;

const GAME_SYSTEM_PROMPT = `You are the implementation stage of PRD2Play.
Generate a complete, dependency-free browser game from the frozen PRD supplied
in this request. This request is isolated from the original user brief: treat
the frozen PRD and its SHA-256 as the complete specification. Do not rewrite or
return a revised PRD, and do not claim tests have passed.

Return exactly one JSON object and no prose. It must use schema_version
"${GAME_PACKAGE_SCHEMA_VERSION}" and contain exactly four text files with these
paths: ${GAME_PACKAGE_FILE_ALLOWLIST.join(", ")}. No absolute paths, parent
segments, nested paths, remote scripts, package-manager dependencies, or extra
files are permitted. index.html must load ./styles.css and ./game.js.

game.js must install window.__PRD2PLAY__ with protocol "prd2play/1" and the
methods isReady(), reset({seed}), observe(), and getEvents({afterSeq}). observe()
must return tick, status (menu|playing|won|lost), state, and latest_event_seq;
events must have increasing seq, tick, type, and optional payload. The bridge is
white-box evidence only. Player actions must still enter through real keyboard,
mouse, or touch DOM event listeners; never expose an action method on the bridge.

game.manifest.json must itself be valid JSON with this shape:
{
  "schema_version":"${GAME_MANIFEST_SCHEMA_VERSION}",
  "entry_path":"index.html",
  "surface":"dom|canvas2d|webgl",
  "viewport":{"width":800,"height":600},
  "controls":[{
    "action_id":"same ID as a PRD control","device":"keyboard|mouse|touch",
    "code":"KeyboardEvent.code when applicable","selector":"CSS selector when applicable",
    "description":"..."
  }],
  "hud_selectors":{"status":"[data-testid='status']"},
  "state_schema":{"fields":{"status":{"type":"string","description":"..."}},"required":["status"]},
  "event_schema":[{"type":"game_started","description":"...","payload_fields":{}}],
  "bridge":{"protocol":"prd2play/1","evidence_only":true,"actions_via_real_input":true}
}
Omit inapplicable optional control fields rather than setting them to null.`;

const REQUEST_SCHEMA_VERSION = "prd2play.hy3-generation-request.v1" as const;
const FROZEN_PRD_INPUT_SCHEMA_VERSION =
  "prd2play.frozen-prd-input.v1" as const;

export interface GenerateGameFromBriefInput {
  brief: UserBriefInput;
  outputRoot?: string;
  runId?: string;
  prdReviewStatus?: "pending" | "approved";
}

export interface GeneratedGameArtifacts {
  brief: UserBrief;
  prd: GeneratedPrd;
  gamePackage: GeneratedGamePackage;
  gameManifest: ReturnType<typeof gameManifestFromPackage>;
  manifest: GenerationRunManifest;
  outputDirectory: string;
}

function stripFence(value: string): string {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function parseJson(value: string): unknown {
  return JSON.parse(stripFence(value)) as unknown;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function defaultRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

function assertSafeRunId(runId: string): void {
  if (
    runId === "." ||
    runId === ".." ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)
  ) {
    throw new Error(`Unsafe generation run ID: ${runId}`);
  }
}

function requestSnapshot(
  phase: "prd" | "game",
  system: string,
  user: string
): string {
  return `${JSON.stringify(
    {
      schema_version: REQUEST_SCHEMA_VERSION,
      phase,
      system,
      user
    },
    null,
    2
  )}\n`;
}

function validateTraceability(prd: GeneratedPrd, brief: UserBrief): void {
  const sourceIntentIds = new Set(
    brief.source_intents.map((sourceIntent) => sourceIntent.id)
  );
  for (const criterion of prd.acceptance_criteria) {
    if (
      criterion.source_quote &&
      !brief.raw_request.includes(criterion.source_quote)
    ) {
      throw new Error(
        `Acceptance criterion ${criterion.id} has a source_quote absent from raw_request`
      );
    }
    for (const sourceIntentId of criterion.source_intent_ids) {
      if (!sourceIntentIds.has(sourceIntentId)) {
        throw new Error(
          `Acceptance criterion ${criterion.id} references unknown source intent ${sourceIntentId}`
        );
      }
    }
  }
}

function validateGameManifestControls(
  prd: GeneratedPrd,
  gamePackage: GeneratedGamePackage
): ReturnType<typeof gameManifestFromPackage> {
  const manifest = gameManifestFromPackage(gamePackage);
  const expected = new Set(prd.controls.map((control) => control.id));
  const actual = new Set(manifest.controls.map((control) => control.action_id));
  for (const controlId of expected) {
    if (!actual.has(controlId)) {
      throw new Error(`Game manifest is missing PRD control ${controlId}`);
    }
  }
  for (const actionId of actual) {
    if (!expected.has(actionId)) {
      throw new Error(`Game manifest invents undeclared control ${actionId}`);
    }
  }
  return manifest;
}

function safeGameOutputPath(root: string, filePath: string): string {
  const outputPath = resolve(root, filePath);
  const relativePath = relative(root, outputPath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe game output path: ${filePath}`);
  }
  return outputPath;
}

export async function generateGameFromBrief(
  input: GenerateGameFromBriefInput,
  client: Pick<Hy3Client, "complete"> = new Hy3Client()
): Promise<GeneratedGameArtifacts> {
  const brief = UserBriefSchema.parse(input.brief);
  const runId = input.runId ?? defaultRunId();
  const prdReviewStatus = input.prdReviewStatus ?? "pending";
  assertSafeRunId(runId);

  const outputRoot = resolve(input.outputRoot ?? "artifacts/generations");
  const outputDirectory = resolve(outputRoot, runId);
  const prdDirectory = resolve(outputDirectory, "prd");
  const gamePhaseDirectory = resolve(outputDirectory, "game");
  const gameDirectory = resolve(gamePhaseDirectory, "files");
  await mkdir(outputRoot, { recursive: true });
  await mkdir(outputDirectory);
  await Promise.all([
    mkdir(prdDirectory),
    mkdir(gamePhaseDirectory),
    writeFile(
      resolve(outputDirectory, "user-brief.json"),
      `${JSON.stringify(brief, null, 2)}\n`,
      "utf8"
    )
  ]);

  const prdUserPrompt = JSON.stringify(brief, null, 2);
  const prdRequest = requestSnapshot("prd", PRD_SYSTEM_PROMPT, prdUserPrompt);
  const prdRequestPath = resolve(prdDirectory, "request.public.json");
  const prdResponsePath = resolve(prdDirectory, "response.raw.txt");
  await writeFile(prdRequestPath, prdRequest, "utf8");
  const rawPrdResponse = await client.complete(
    PRD_SYSTEM_PROMPT,
    prdUserPrompt
  );
  await writeFile(prdResponsePath, rawPrdResponse, "utf8");

  const prd = GeneratedPrdSchema.parse(parseJson(rawPrdResponse));
  validateTraceability(prd, brief);
  const frozenPrdText = `${JSON.stringify(prd, null, 2)}\n`;
  const frozenPrdSha256 = sha256(frozenPrdText);
  const frozenPrdPath = resolve(prdDirectory, "frozen.json");
  await writeFile(frozenPrdPath, frozenPrdText, "utf8");

  const gameInput = {
    schema_version: FROZEN_PRD_INPUT_SCHEMA_VERSION,
    frozen_prd_sha256: frozenPrdSha256,
    prd_review_status: prdReviewStatus,
    frozen_prd: prd
  };
  const gameUserPrompt = JSON.stringify(gameInput, null, 2);
  const gameRequest = requestSnapshot(
    "game",
    GAME_SYSTEM_PROMPT,
    gameUserPrompt
  );
  const gameRequestPath = resolve(gamePhaseDirectory, "request.public.json");
  const gameResponsePath = resolve(gamePhaseDirectory, "response.raw.txt");
  await writeFile(gameRequestPath, gameRequest, "utf8");
  const rawGameResponse = await client.complete(
    GAME_SYSTEM_PROMPT,
    gameUserPrompt
  );
  await writeFile(gameResponsePath, rawGameResponse, "utf8");

  const gamePackage = GeneratedGamePackageSchema.parse(
    parseJson(rawGameResponse)
  );
  const gameManifest = validateGameManifestControls(prd, gamePackage);
  await mkdir(gameDirectory);
  await Promise.all(
    gamePackage.files.map((file) =>
      writeFile(
        safeGameOutputPath(gameDirectory, file.path),
        file.content,
        "utf8"
      )
    )
  );
  const gamePackagePath = resolve(gamePhaseDirectory, "package.json");
  await writeFile(
    gamePackagePath,
    `${JSON.stringify(gamePackage, null, 2)}\n`,
    "utf8"
  );

  const manifest = GenerationRunManifestSchema.parse({
    schema_version: GENERATION_RUN_SCHEMA_VERSION,
    run_id: runId,
    created_at: new Date().toISOString(),
    prd_review_status: prdReviewStatus,
    user_brief_file: "user-brief.json",
    frozen_prd_file: "prd/frozen.json",
    frozen_prd_sha256: frozenPrdSha256,
    game_package_file: "game/package.json",
    game_directory: "game/files",
    calls: [
      {
        phase: "prd",
        input_basis: "user_brief",
        request_file: "prd/request.public.json",
        response_file: "prd/response.raw.txt",
        request_sha256: sha256(prdRequest),
        response_sha256: sha256(rawPrdResponse)
      },
      {
        phase: "game",
        input_basis: "frozen_prd",
        request_file: "game/request.public.json",
        response_file: "game/response.raw.txt",
        request_sha256: sha256(gameRequest),
        response_sha256: sha256(rawGameResponse)
      }
    ],
    secret_fields_persisted: false,
    second_response_mutated_frozen_prd: false,
    actions_via_real_input: true
  });
  await writeFile(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return {
    brief,
    prd,
    gamePackage,
    gameManifest,
    manifest,
    outputDirectory
  };
}
