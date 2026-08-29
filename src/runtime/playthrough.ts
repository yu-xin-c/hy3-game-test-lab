import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { ConsoleMessage, Page } from "@playwright/test";
import type {
  Observation,
  PublicCase
} from "../contracts/schemas";
import type { GameEvent, GameObservation } from "./bridge";

export interface BrowserConsoleRecord {
  type: string;
  text: string;
  location: {
    url: string;
    line_number: number;
    column_number: number;
  };
  action_index: number | null;
}

export interface BrowserPageErrorRecord {
  name: string;
  message: string;
  stack: string | null;
  action_index: number | null;
}

export interface RuntimeDiagnostic {
  source: "console" | "pageerror" | "runner";
  message: string;
  action_index: number | null;
}

export interface ActionTrace {
  schema_version: "gametestlab.trace.v1";
  case_id: string;
  scenario_id: string;
  action_index: number;
  action_id: string;
  checkpoint_ids: string[];
  bridge: GameObservation | null;
  ui: Record<string, unknown>;
  canvas: Record<string, unknown>;
  game_events: GameEvent[];
  runtime_errors: string[];
  screenshot: string | null;
  state_hash: string;
}

export interface PlaythroughOptions {
  page: Page;
  baseURL: string;
  publicCase: PublicCase;
  scenarioId: string;
  fixtureVariant: string;
  evidenceDirectory?: string;
  evidencePathRoot?: string;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
}

export interface PlaythroughResult {
  case_id: string;
  scenario_id: string;
  url: string;
  observations: Observation[];
  trace: ActionTrace[];
  console: BrowserConsoleRecord[];
  page_errors: BrowserPageErrorRecord[];
  diagnostics: RuntimeDiagnostic[];
}

interface BrowserSnapshot {
  bridge: GameObservation | null;
  events: GameEvent[];
  ui: Record<string, unknown>;
  canvas: Record<string, unknown>;
  latestEventSeq: number;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function stateHash(state: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(state)).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function performAction(
  page: Page,
  publicCase: PublicCase,
  actionId: string,
  timeout: number
): Promise<void> {
  const control = publicCase.controls.find(
    (candidate) => candidate.action_id === actionId
  );
  if (!control) throw new Error(`No control is defined for action ${actionId}`);

  if (control.device === "keyboard") {
    if (!control.code) {
      throw new Error(`Keyboard action ${actionId} has no key code`);
    }
    await page.keyboard.press(control.code);
    return;
  }

  let x: number;
  let y: number;
  if (control.code) {
    const target = page.locator(control.code).first();
    if (control.device === "mouse") {
      await target.click({ timeout });
      return;
    }
    const box = await target.boundingBox({ timeout });
    if (!box) throw new Error(`Touch target is not visible: ${control.code}`);
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    if (control.x_ratio === undefined || control.y_ratio === undefined) {
      throw new Error(
        `${control.device} action ${actionId} needs a selector or x/y ratios`
      );
    }
    const surface = page.locator("canvas").first();
    const box = await surface.boundingBox({ timeout });
    if (box) {
      x = box.x + box.width * control.x_ratio;
      y = box.y + box.height * control.y_ratio;
    } else {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("The browser page has no viewport");
      x = viewport.width * control.x_ratio;
      y = viewport.height * control.y_ratio;
    }
  }

  if (control.device === "touch") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function readBrowserSnapshot(
  page: Page,
  afterEventSeq: number,
  selectors: PublicCase["game"]["selectors"]
): Promise<BrowserSnapshot> {
  const bridgePayload = await page.evaluate(async ({ afterSeq }) => {
    const bridge = window.__GAMETESTLAB__;
    if (!bridge || bridge.protocol !== "gametestlab/1") {
      throw new Error("window.__GAMETESTLAB__ bridge is unavailable");
    }
    const observation = await bridge.observe();
    const events = await bridge.getEvents({ afterSeq });
    return { observation, events };
  }, { afterSeq: afterEventSeq });

  const visualPayload = await page.evaluate((configuredSelectors) => {
    // Keep this callback free of nested function declarations. Some TS
    // launchers decorate nested functions with an out-of-scope `__name`
    // helper before Playwright serializes the callback into the browser.
    const scoreNode = document.querySelector(configuredSelectors.score);
    const statusNode = document.querySelector(configuredSelectors.status);
    const scoreRect = scoreNode?.getBoundingClientRect();
    const statusRect = statusNode?.getBoundingClientRect();
    const scoreStyle = scoreNode ? window.getComputedStyle(scoreNode) : null;
    const statusStyle = statusNode ? window.getComputedStyle(statusNode) : null;
    const scoreEvidence = scoreNode && scoreRect && scoreStyle
      ? {
          present: true,
          text: scoreNode.textContent?.trim() ?? "",
          visible:
            scoreRect.width > 0 &&
            scoreRect.height > 0 &&
            scoreStyle.display !== "none" &&
            scoreStyle.visibility !== "hidden" &&
            scoreStyle.opacity !== "0",
          rect: {
            x: scoreRect.x,
            y: scoreRect.y,
            width: scoreRect.width,
            height: scoreRect.height
          }
        }
      : { present: false, text: null };
    const statusEvidence = statusNode && statusRect && statusStyle
      ? {
          present: true,
          text: statusNode.textContent?.trim() ?? "",
          visible:
            statusRect.width > 0 &&
            statusRect.height > 0 &&
            statusStyle.display !== "none" &&
            statusStyle.visibility !== "hidden" &&
            statusStyle.opacity !== "0",
          rect: {
            x: statusRect.x,
            y: statusRect.y,
            width: statusRect.width,
            height: statusRect.height
          }
        }
      : { present: false, text: null };

    const surfaceNode = document.querySelector(configuredSelectors.surface);
    let canvasEvidence: Record<string, unknown> = { present: false };
    let canvasVisible = false;
    if (surfaceNode) {
      const rect = surfaceNode.getBoundingClientRect();
      const style = window.getComputedStyle(surfaceNode);
      canvasVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0";
      canvasEvidence = {
        present: true,
        visible: canvasVisible,
        tag_name: surfaceNode.tagName.toLowerCase(),
        client_width: rect.width,
        client_height: rect.height
      };

      if (surfaceNode instanceof HTMLCanvasElement) try {
        canvasEvidence.width = surfaceNode.width;
        canvasEvidence.height = surfaceNode.height;
        const context = surfaceNode.getContext("2d");
        if (context) {
          const pixels = context.getImageData(
            0,
            0,
            surfaceNode.width,
            surfaceNode.height
          ).data;
          const stride = Math.max(4, Math.floor(pixels.length / 4096 / 4) * 4);
          let checksum = 2_166_136_261;
          let sampledAlphaPixels = 0;
          for (let offset = 0; offset < pixels.length; offset += stride) {
            const red = pixels[offset] ?? 0;
            const green = pixels[offset + 1] ?? 0;
            const blue = pixels[offset + 2] ?? 0;
            const alpha = pixels[offset + 3] ?? 0;
            checksum ^= red | (green << 8) | (blue << 16) | (alpha << 24);
            checksum = Math.imul(checksum, 16_777_619) >>> 0;
            if (alpha > 0) sampledAlphaPixels += 1;
          }
          canvasEvidence.pixel_checksum = checksum.toString(16).padStart(8, "0");
          canvasEvidence.sampled_alpha_pixels = sampledAlphaPixels;
        }
      } catch (error) {
        canvasEvidence.inspection_error =
          error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ui: {
        scoreText: scoreNode?.textContent?.trim() ?? null,
        statusText: statusNode?.textContent?.trim() ?? null,
        canvasVisible,
        dom: {
          score: scoreEvidence,
          status: statusEvidence
        },
        canvas: canvasEvidence
      },
      canvas: canvasEvidence
    };
  }, selectors);

  return {
    bridge: bridgePayload.observation,
    events: bridgePayload.events,
    ui: visualPayload.ui,
    canvas: visualPayload.canvas,
    latestEventSeq: Math.max(
      bridgePayload.observation.latest_event_seq,
      ...bridgePayload.events.map((event) => event.seq)
    )
  };
}

export async function runPlaythrough(
  options: PlaythroughOptions
): Promise<PlaythroughResult> {
  const {
    page,
    publicCase,
    scenarioId,
    fixtureVariant,
    evidenceDirectory
  } = options;
  const scenario = publicCase.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} is not present in ${publicCase.id}`);
  }

  const navigationTimeout = options.navigationTimeoutMs ?? 15_000;
  const actionTimeout = options.actionTimeoutMs ?? 5_000;
  const gameURL = new URL(publicCase.game.entry_path, options.baseURL);
  gameURL.searchParams.set("variant", fixtureVariant);

  const observations: Observation[] = [];
  const trace: ActionTrace[] = [];
  const consoleRecords: BrowserConsoleRecord[] = [];
  const pageErrors: BrowserPageErrorRecord[] = [];
  const diagnostics: RuntimeDiagnostic[] = [];
  let activeActionIndex: number | null = null;
  let diagnosticCursor = 0;
  let eventSeq = 0;
  let bridgeReady = false;

  const addRunnerDiagnostic = (message: string) => {
    diagnostics.push({
      source: "runner",
      message,
      action_index: activeActionIndex
    });
  };
  const onConsole = (message: ConsoleMessage) => {
    const location = message.location();
    const record: BrowserConsoleRecord = {
      type: message.type(),
      text: message.text(),
      location: {
        url: location.url,
        line_number: location.lineNumber,
        column_number: location.columnNumber
      },
      action_index: activeActionIndex
    };
    consoleRecords.push(record);
    if (message.type() === "error") {
      diagnostics.push({
        source: "console",
        message: message.text(),
        action_index: activeActionIndex
      });
    }
  };
  const onPageError = (error: Error) => {
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      action_index: activeActionIndex
    });
    diagnostics.push({
      source: "pageerror",
      message: `${error.name}: ${error.message}`,
      action_index: activeActionIndex
    });
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.setViewportSize(publicCase.game.viewport);
    try {
      await page.goto(gameURL.href, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout
      });
      await page.waitForFunction(
        () =>
          window.__GAMETESTLAB__?.protocol === "gametestlab/1" &&
          window.__GAMETESTLAB__.isReady(),
        undefined,
        { timeout: navigationTimeout }
      );
      await page.evaluate(async ({ seed }) => {
        const bridge = window.__GAMETESTLAB__;
        if (!bridge) throw new Error("window.__GAMETESTLAB__ bridge is unavailable");
        await bridge.reset({ seed });
      }, { seed: scenario.seed });
      bridgeReady = true;
    } catch (error) {
      addRunnerDiagnostic(`Browser setup failed: ${errorMessage(error)}`);
    }

    if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });

    for (const [actionIndex, step] of scenario.steps.entries()) {
      activeActionIndex = actionIndex;
      if (bridgeReady) {
        try {
          await performAction(page, publicCase, step.action_id, actionTimeout);
          if (step.advance_ms > 0) await page.waitForTimeout(step.advance_ms);
          else await page.waitForTimeout(0);
        } catch (error) {
          addRunnerDiagnostic(
            `Action ${step.action_id} failed: ${errorMessage(error)}`
          );
        }
      }

      let snapshot: BrowserSnapshot = {
        bridge: null,
        events: [],
        ui: {},
        canvas: {},
        latestEventSeq: eventSeq
      };
      if (bridgeReady) {
        try {
          snapshot = await readBrowserSnapshot(
            page,
            eventSeq,
            publicCase.game.selectors
          );
          eventSeq = snapshot.latestEventSeq;
        } catch (error) {
          addRunnerDiagnostic(`Evidence capture failed: ${errorMessage(error)}`);
        }
      }

      let screenshot: string | null = null;
      if (evidenceDirectory && !page.isClosed()) {
        const screenshotPath = resolve(
          evidenceDirectory,
          `${publicCase.id}-action-${String(actionIndex).padStart(2, "0")}.png`
        );
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          screenshot = relative(
            options.evidencePathRoot ?? process.cwd(),
            screenshotPath
          ).split("\\").join("/");
        } catch (error) {
          addRunnerDiagnostic(`Screenshot failed: ${errorMessage(error)}`);
        }
      }

      const actionDiagnostics = diagnostics.slice(diagnosticCursor);
      diagnosticCursor = diagnostics.length;
      const runtimeErrors = actionDiagnostics.map(
        (diagnostic) => `${diagnostic.source}: ${diagnostic.message}`
      );
      const state = snapshot.bridge?.state ?? {};
      const hash = stateHash(state);
      const eventTypes = snapshot.events.map((event) => event.type);

      for (const checkpointId of step.checkpoints) {
        const evidence: Observation["evidence"] = { state_hash: hash };
        if (screenshot) evidence.screenshot = screenshot;
        observations.push({
          action_index: actionIndex,
          checkpoint_id: checkpointId,
          state,
          ui: snapshot.ui,
          event_types: eventTypes,
          runtime_errors: runtimeErrors,
          evidence
        });
      }

      trace.push({
        schema_version: "gametestlab.trace.v1",
        case_id: publicCase.id,
        scenario_id: scenario.id,
        action_index: actionIndex,
        action_id: step.action_id,
        checkpoint_ids: step.checkpoints,
        bridge: snapshot.bridge,
        ui: snapshot.ui,
        canvas: snapshot.canvas,
        game_events: snapshot.events,
        runtime_errors: runtimeErrors,
        screenshot,
        state_hash: hash
      });
    }
  } finally {
    activeActionIndex = null;
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  return {
    case_id: publicCase.id,
    scenario_id: scenario.id,
    url: gameURL.href,
    observations,
    trace,
    console: consoleRecords,
    page_errors: pageErrors,
    diagnostics
  };
}
