import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
  WebSocket as PlaywrightWebSocket
} from "@playwright/test";
import type {
  Observation,
  PublicCase,
  ScenarioStep,
  TimelineSample
} from "../contracts/schemas";
import {
  assertEventEpochDidNotRegress,
  parseGameEvents,
  parseGameObservation,
  type GameEvent,
  type GameObservation
} from "./bridge";
import { isInsidePath } from "../contracts/paths";

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
  source: "console" | "pageerror" | "network" | "runner";
  message: string;
  action_index: number | null;
  frame_index: number | null;
  elapsed_ms: number;
}

export interface BrowserNetworkRecord {
  kind: "request" | "response" | "request_failed" | "websocket";
  url: string;
  method: string;
  resource_type: string;
  status: number | null;
  status_text: string | null;
  failure: string | null;
  action_index: number | null;
}

export interface ActionTrace {
  schema_version: "gametestlab.trace.v2" | "gametestlab.trace.v3";
  case_id: string;
  scenario_id: string;
  seed: number;
  clock: PublicCase["scenarios"][number]["clock"];
  action_index: number;
  action_id: string;
  step_kind: ScenarioStep["kind"];
  checkpoint_ids: string[];
  elapsed_ms: number;
  samples: TimelineSample[];
  bridge: GameObservation | null;
  ui: Record<string, unknown>;
  canvas: Record<string, unknown>;
  game_events: GameEvent[];
  console: BrowserConsoleRecord[];
  page_errors: BrowserPageErrorRecord[];
  network: BrowserNetworkRecord[];
  diagnostics: RuntimeDiagnostic[];
  runtime_errors: string[];
  screenshot: string | null;
  state_hash: string;
}

export interface PlaythroughOptions {
  page: Page;
  secondaryPage?: Page;
  baseURL: string;
  publicCase: PublicCase;
  scenarioId: string;
  fixtureVariant: string;
  evidenceDirectory?: string;
  evidencePathRoot?: string;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  acceptMissingBridgeProtocol?: boolean;
}

export interface PlaythroughResult {
  case_id: string;
  scenario_id: string;
  url: string;
  observations: Observation[];
  trace: ActionTrace[];
  console: BrowserConsoleRecord[];
  page_errors: BrowserPageErrorRecord[];
  network: BrowserNetworkRecord[];
  diagnostics: RuntimeDiagnostic[];
}

interface BrowserSnapshot {
  bridge: GameObservation | null;
  events: GameEvent[];
  ui: Record<string, unknown>;
  canvas: Record<string, unknown>;
  latestEventSeq: number;
  latestEventEpoch: number;
  latestEventSignature: string | null;
}

interface BridgeSnapshot {
  bridge: GameObservation;
  events: GameEvent[];
  latestEventSeq: number;
  latestEventEpoch: number;
  latestEventSignature: string | null;
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

async function withHardTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function ignorableAssetURL(urlValue: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(urlValue);
    return url.origin === expectedOrigin && url.pathname === "/favicon.ico";
  } catch {
    return false;
  }
}

function ignorableBrowserAsset(request: Request, expectedOrigin: string): boolean {
  return request.resourceType() === "other" &&
    ignorableAssetURL(request.url(), expectedOrigin);
}

async function performAction(
  primaryPage: Page,
  secondaryPage: Page | undefined,
  publicCase: PublicCase,
  actionId: string,
  timeout: number
): Promise<void> {
  const control = publicCase.controls.find(
    (candidate) => candidate.action_id === actionId
  );
  if (!control) throw new Error(`No control is defined for action ${actionId}`);
  const page = control.actor === "secondary" ? secondaryPage : primaryPage;
  if (!page) {
    throw new Error(`Action ${actionId} requires a secondary browser page`);
  }

  if (control.device === "camera") {
    if (!control.fixture_frame) {
      throw new Error(`Camera action ${actionId} has no fixture_frame`);
    }
    await withHardTimeout(
      page.evaluate((frameId) => {
        const controller = (window as unknown as {
          __GAMETESTLAB_CAMERA_FIXTURE__?: { setFrame(id: string): void };
        }).__GAMETESTLAB_CAMERA_FIXTURE__;
        if (!controller) throw new Error("camera fixture is unavailable");
        controller.setFrame(frameId);
      }, control.fixture_frame),
      timeout,
      `camera fixture ${control.fixture_frame}`
    );
    return;
  }

  if (control.device === "keyboard") {
    if (!control.code) {
      throw new Error(`Keyboard action ${actionId} has no key code`);
    }
    if (control.key_event === "down") await page.keyboard.down(control.code);
    else if (control.key_event === "up") await page.keyboard.up(control.code);
    else await page.keyboard.press(control.code);
    return;
  }

  let x: number;
  let y: number;
  const pointerSelector = control.selector ?? control.code;
  if (pointerSelector) {
    const target = page.locator(pointerSelector).first();
    if (control.device === "mouse") {
      await target.click({ timeout });
      return;
    }
    const box = await target.boundingBox({ timeout });
    if (!box) throw new Error(`Touch target is not visible: ${pointerSelector}`);
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    if (control.x_ratio === undefined || control.y_ratio === undefined) {
      throw new Error(
        `${control.device} action ${actionId} needs a selector or x/y ratios`
      );
    }
    const surface = page.locator(publicCase.game.selectors.surface).first();
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

async function installCameraFixture(page: Page): Promise<void> {
  // Keep injected code literal: tsx adds closure-external __name helpers to
  // nested functions, which are unavailable when serialized into the page.
  await page.addInitScript({ content: `(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("camera fixture needs Canvas2D");
    const drawFrame = (id) => {
      context.fillStyle = "#10141f";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.lineWidth = 16;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (id === "swipe-up-blue") {
        context.strokeStyle = "#2477ff";
        context.beginPath();
        context.moveTo(160, 190);
        context.lineTo(160, 58);
        context.moveTo(116, 102);
        context.lineTo(160, 58);
        context.lineTo(204, 102);
        context.stroke();
      } else if (id === "circle-red") {
        context.strokeStyle = "#ef4444";
        context.beginPath();
        context.arc(160, 120, 58, 0, Math.PI * 2);
        context.stroke();
      } else if (id === "open-gold") {
        context.strokeStyle = "#f7c948";
        context.lineWidth = 13;
        context.beginPath();
        context.moveTo(112, 192);
        context.lineTo(94, 136);
        context.lineTo(94, 82);
        context.moveTo(94, 136);
        context.lineTo(120, 58);
        context.moveTo(116, 132);
        context.lineTo(146, 45);
        context.moveTo(140, 132);
        context.lineTo(174, 48);
        context.moveTo(164, 136);
        context.lineTo(202, 68);
        context.moveTo(187, 137);
        context.lineTo(226, 100);
        context.moveTo(112, 192);
        context.quadraticCurveTo(166, 222, 214, 183);
        context.lineTo(226, 100);
        context.stroke();
      } else if (id === "fist-wrong") {
        context.fillStyle = "#ef4444";
        context.beginPath();
        context.roundRect(105, 82, 110, 104, 32);
        context.fill();
        context.strokeStyle = "#10141f";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(105, 116);
        context.lineTo(215, 116);
        context.moveTo(132, 84);
        context.lineTo(132, 125);
        context.moveTo(160, 84);
        context.lineTo(160, 125);
        context.moveTo(188, 84);
        context.lineTo(188, 125);
        context.stroke();
      } else if (id === "left-pose" || id.includes("blue") || id.includes("left")) {
        context.fillStyle = "#2477ff";
        context.fillRect(28, 72, 72, 96);
      } else if (id === "center-pose" || id.includes("green") || id.includes("center")) {
        context.fillStyle = "#36d17c";
        context.beginPath();
        context.arc(160, 120, 48, 0, Math.PI * 2);
        context.fill();
      } else if (id === "right-pose") {
        context.fillStyle = "#ef4444";
        context.fillRect(220, 72, 72, 96);
      } else if (id.includes("yellow") || id.includes("gold") || id.includes("right")) {
        context.fillStyle = "#f7c948";
        context.beginPath();
        context.moveTo(270, 54);
        context.lineTo(218, 178);
        context.lineTo(312, 178);
        context.closePath();
        context.fill();
      } else {
        context.strokeStyle = "#ef4444";
        context.beginPath();
        context.moveTo(100, 60);
        context.lineTo(220, 180);
        context.moveTo(220, 60);
        context.lineTo(100, 180);
        context.stroke();
      }
      context.fillStyle = "#ffffff";
      context.font = "14px sans-serif";
      context.fillText(id, 8, 22);
    };
    drawFrame("idle");
    const stream = canvas.captureStream(30);
    const mediaDevices = navigator.mediaDevices;
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => stream
    });
    window.__GAMETESTLAB_CAMERA_FIXTURE__ = { setFrame: drawFrame };
  })();` });
}

async function flushBrowserTasks(pages: Page[]): Promise<void> {
  await Promise.all(pages.map((page) => page.evaluate(() =>
    new Promise<void>((resolveFlush) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolveFlush();
      channel.port2.postMessage(null);
    })
  )));
}

async function readBridgeSnapshot(
  page: Page,
  afterEventSeq: number,
  afterEventSignature: string | null,
  afterEventEpoch: number,
  timeoutMs: number
): Promise<BridgeSnapshot> {
  const payload = await withHardTimeout(
    page.evaluate(async () => {
      const bridge = window.__GAMETESTLAB__;
      if (!bridge || bridge.protocol !== "gametestlab/2") {
        throw new Error("window.__GAMETESTLAB__ bridge is unavailable");
      }
      const observation = await bridge.observe();
      const events = await bridge.getEvents({ afterSeq: 0 });
      return { observation, events };
    }),
    timeoutMs,
    "bridge.observe()/getEvents()"
  );

  const observation = parseGameObservation(payload.observation);
  const normalizedEvents = Array.isArray(payload.events)
    ? payload.events.map((event) => {
        if (
          event !== null &&
          typeof event === "object" &&
          typeof (event as { tick?: unknown }).tick !== "number"
        ) {
          return { ...event, tick: 0 };
        }
        return event;
      })
    : payload.events;
  const completeEvents = parseGameEvents(normalizedEvents);
  assertEventEpochDidNotRegress(afterEventEpoch, observation.event_epoch);
  const latestEvent = completeEvents.at(-1);
  if ((latestEvent?.seq ?? 0) !== observation.latest_event_seq) {
    throw new Error(
      "bridge latest_event_seq does not match the complete event stream"
    );
  }
  if (completeEvents.some((event) => event.tick > observation.tick)) {
    throw new Error("bridge event tick exceeds observation tick");
  }
  const anchor = completeEvents.find((event) => event.seq === afterEventSeq);
  const epochChanged = observation.event_epoch !== afterEventEpoch;
  if (
    !epochChanged &&
    afterEventSeq > 0 &&
    (!anchor || canonicalJson(anchor) !== afterEventSignature)
  ) {
    throw new Error("bridge event log changed without incrementing event_epoch");
  }
  const events = epochChanged
    ? completeEvents
    : completeEvents.filter((event) => event.seq > afterEventSeq);

  return {
    bridge: observation,
    events,
    latestEventSeq: observation.latest_event_seq,
    latestEventEpoch: observation.event_epoch,
    latestEventSignature: latestEvent ? canonicalJson(latestEvent) : null
  };
}

async function readBrowserSnapshot(
  page: Page,
  afterEventSeq: number,
  afterEventSignature: string | null,
  afterEventEpoch: number,
  timeoutMs: number,
  selectors: PublicCase["game"]["selectors"]
): Promise<BrowserSnapshot> {
  const bridgePayload = await readBridgeSnapshot(
    page,
    afterEventSeq,
    afterEventSignature,
    afterEventEpoch,
    timeoutMs
  );

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
    bridge: bridgePayload.bridge,
    events: bridgePayload.events,
    ui: visualPayload.ui,
    canvas: visualPayload.canvas,
    latestEventSeq: bridgePayload.latestEventSeq,
    latestEventEpoch: bridgePayload.latestEventEpoch,
    latestEventSignature: bridgePayload.latestEventSignature
  };
}

async function advanceScenarioTime(
  pages: Page[],
  mode: "real" | "virtual",
  milliseconds: number
): Promise<void> {
  if (milliseconds <= 0) return;
  if (mode === "virtual") {
    await Promise.all(pages.map((page) => page.clock.runFor(milliseconds)));
  } else {
    await Promise.all(pages.map((page) => page.waitForTimeout(milliseconds)));
  }
}

function stepActionId(step: ScenarioStep): string {
  if (step.kind === "input") return step.action_id;
  if (step.kind === "advance_time") return "ADVANCE_TIME";
  if (step.kind === "advance_frames") return "ADVANCE_FRAMES";
  return `RELOAD_${step.actor.toUpperCase()}`;
}

function timelineSample(
  snapshot: BridgeSnapshot,
  sampleIndex: number,
  actionIndex: number,
  elapsedMs: number,
  frameIndex?: number | undefined
): TimelineSample {
  return {
    sample_index: sampleIndex,
    action_index: actionIndex,
    ...(frameIndex === undefined ? {} : { frame_index: frameIndex }),
    elapsed_ms: elapsedMs,
    tick: snapshot.bridge.tick,
    status: snapshot.bridge.status,
    state: snapshot.bridge.state,
    event_types: snapshot.events.map((event) => event.type)
  };
}

export async function runPlaythrough(
  options: PlaythroughOptions
): Promise<PlaythroughResult> {
  const {
    page,
    secondaryPage,
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
  const acceptMissingBridgeProtocol = options.acceptMissingBridgeProtocol ?? false;
  if (!Number.isFinite(actionTimeout) || actionTimeout <= 0) {
    throw new Error("actionTimeoutMs must be a positive finite number");
  }
  const baseURL = new URL(options.baseURL);
  const gameURL = new URL(publicCase.game.entry_path, baseURL);
  if (gameURL.origin !== baseURL.origin) {
    throw new Error("game entry_path resolved outside the configured origin");
  }
  gameURL.searchParams.set("variant", fixtureVariant);
  gameURL.searchParams.set("actor", "primary");
  const secondaryGameURL = new URL(gameURL);
  secondaryGameURL.searchParams.set("actor", "secondary");
  const pages = secondaryPage ? [page, secondaryPage] : [page];
  if (
    publicCase.controls.some((control) => control.actor === "secondary") &&
    !secondaryPage
  ) {
    throw new Error("This case requires a secondary browser page");
  }

  const observations: Observation[] = [];
  const trace: ActionTrace[] = [];
  const consoleRecords: BrowserConsoleRecord[] = [];
  const pageErrors: BrowserPageErrorRecord[] = [];
  const networkRecords: BrowserNetworkRecord[] = [];
  const diagnostics: RuntimeDiagnostic[] = [];
  let activeActionIndex: number | null = null;
  let traceDiagnosticCursor = 0;
  let traceConsoleCursor = 0;
  let tracePageErrorCursor = 0;
  let traceNetworkCursor = 0;
  let observationDiagnosticCursor = 0;
  let eventSeq = 0;
  let eventEpoch = -1;
  let eventSignature: string | null = null;
  let bridgeReady = false;
  let elapsedMs = 0;
  let frameIndex = 0;
  let activeFrameIndex: number | null = null;
  let diagnosticElapsedMs = 0;
  const scenarioSamples: TimelineSample[] = [];

  const addRunnerDiagnostic = (message: string) => {
    diagnostics.push({
      source: "runner",
      message,
      action_index: activeActionIndex,
      frame_index: activeFrameIndex,
      elapsed_ms: diagnosticElapsedMs
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
    const ignoredMissingAsset =
      message.text().startsWith("Failed to load resource:") &&
      ignorableAssetURL(location.url, gameURL.origin);
    if (
      message.type() === "error" &&
      !ignoredMissingAsset
    ) {
      diagnostics.push({
        source: "console",
        message: message.text(),
        action_index: activeActionIndex,
        frame_index: activeFrameIndex,
        elapsed_ms: diagnosticElapsedMs
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
      action_index: activeActionIndex,
      frame_index: activeFrameIndex,
      elapsed_ms: diagnosticElapsedMs
    });
  };
  const onResponse = (response: Response) => {
    const request = response.request();
    if (ignorableBrowserAsset(request, gameURL.origin)) return;
    const record: BrowserNetworkRecord = {
      kind: "response",
      url: response.url(),
      method: request.method(),
      resource_type: request.resourceType(),
      status: response.status(),
      status_text: response.statusText(),
      failure: null,
      action_index: activeActionIndex
    };
    networkRecords.push(record);
    const externalOrigin = new URL(response.url()).origin !== gameURL.origin;
    if (response.status() >= 400 || externalOrigin) {
      diagnostics.push({
        source: "network",
        message: externalOrigin
          ? `external resource ${record.method} ${record.url}`
          : `${record.status} ${record.method} ${record.url}`,
        action_index: activeActionIndex,
        frame_index: activeFrameIndex,
        elapsed_ms: diagnosticElapsedMs
      });
    }
  };
  const onRequest = (request: Request) => {
    if (ignorableBrowserAsset(request, gameURL.origin)) return;
    const requestURL = new URL(request.url());
    if (requestURL.origin === gameURL.origin) return;
    const record: BrowserNetworkRecord = {
      kind: "request",
      url: request.url(),
      method: request.method(),
      resource_type: request.resourceType(),
      status: null,
      status_text: null,
      failure: null,
      action_index: activeActionIndex
    };
    networkRecords.push(record);
    diagnostics.push({
      source: "network",
      message: `external request ${record.method} ${record.url}`,
      action_index: activeActionIndex,
      frame_index: activeFrameIndex,
      elapsed_ms: diagnosticElapsedMs
    });
  };
  const onRequestFailed = (request: Request) => {
    if (ignorableBrowserAsset(request, gameURL.origin)) return;
    const record: BrowserNetworkRecord = {
      kind: "request_failed",
      url: request.url(),
      method: request.method(),
      resource_type: request.resourceType(),
      status: null,
      status_text: null,
      failure: request.failure()?.errorText ?? null,
      action_index: activeActionIndex
    };
    networkRecords.push(record);
    diagnostics.push({
      source: "network",
      message: `${record.method} ${record.url}: ${record.failure ?? "request failed"}`,
      action_index: activeActionIndex,
      frame_index: activeFrameIndex,
      elapsed_ms: diagnosticElapsedMs
    });
  };
  const onWebSocket = (socket: PlaywrightWebSocket) => {
    const socketURL = new URL(socket.url());
    if (socketURL.origin === gameURL.origin) return;
    const record: BrowserNetworkRecord = {
      kind: "websocket",
      url: socket.url(),
      method: "GET",
      resource_type: "websocket",
      status: null,
      status_text: null,
      failure: null,
      action_index: activeActionIndex
    };
    networkRecords.push(record);
    diagnostics.push({
      source: "network",
      message: `external websocket ${record.url}`,
      action_index: activeActionIndex,
      frame_index: activeFrameIndex,
      elapsed_ms: diagnosticElapsedMs
    });
  };

  for (const targetPage of pages) {
    targetPage.on("console", onConsole);
    targetPage.on("pageerror", onPageError);
    targetPage.on("request", onRequest);
    targetPage.on("response", onResponse);
    targetPage.on("requestfailed", onRequestFailed);
    targetPage.on("websocket", onWebSocket);
  }

  try {
    await Promise.all(pages.map((targetPage) =>
      targetPage.setViewportSize(publicCase.game.viewport)
    ));
    try {
      if (publicCase.controls.some((control) => control.device === "touch")) {
        const touchResults = await Promise.all(pages.map((targetPage) =>
          withHardTimeout(
            targetPage.evaluate(() => navigator.maxTouchPoints > 0),
            actionTimeout,
            "touch-context preflight"
          )
        ));
        if (touchResults.some((hasTouch) => !hasTouch)) {
          throw new Error(
            "Touch controls require a browser context created with hasTouch: true"
          );
        }
      }
      if (publicCase.controls.some((control) => control.device === "camera")) {
        await Promise.all(pages.map(installCameraFixture));
      }
      if (scenario.clock.mode === "virtual") {
        const setupStart = scenario.clock.start_time_ms - scenario.clock.setup_ms;
        await Promise.all(pages.map(async (targetPage) => {
          await targetPage.clock.install({ time: setupStart });
          await targetPage.clock.pauseAt(setupStart);
        }));
      }
      await Promise.all([
        page.goto(gameURL.href, {
          waitUntil: "domcontentloaded",
          timeout: navigationTimeout
        }),
        ...(secondaryPage ? [secondaryPage.goto(secondaryGameURL.href, {
          waitUntil: "domcontentloaded" as const,
          timeout: navigationTimeout
        })] : [])
      ]);
      if (scenario.clock.mode === "virtual" && scenario.clock.setup_ms > 0) {
        await Promise.all(pages.map((targetPage) =>
          targetPage.clock.runFor(scenario.clock.setup_ms)
        ));
      }
      await Promise.all(pages.map((targetPage) => targetPage.waitForFunction(
        (acceptMissing) => {
          const bridge = window.__GAMETESTLAB__;
          return Boolean(
            bridge &&
            (bridge.protocol === "gametestlab/2" ||
              (acceptMissing && bridge.protocol === undefined)) &&
            bridge.isReady()
          );
        },
        acceptMissingBridgeProtocol,
        { timeout: navigationTimeout }
      )));
      if (acceptMissingBridgeProtocol) {
        await Promise.all(pages.map((targetPage) => targetPage.evaluate(() => {
          const bridge = window.__GAMETESTLAB__ as
            | (typeof window.__GAMETESTLAB__ & { protocol?: "gametestlab/2" })
            | undefined;
          if (bridge && bridge.protocol === undefined) {
            Object.defineProperty(bridge, "protocol", {
              configurable: false,
              enumerable: true,
              value: "gametestlab/2",
              writable: false
            });
          }
        })));
      }
      await Promise.all(pages.map((targetPage) => withHardTimeout(
        targetPage.evaluate(async ({ seed }) => {
          const bridge = window.__GAMETESTLAB__;
          if (!bridge) {
            throw new Error("window.__GAMETESTLAB__ bridge is unavailable");
          }
          await bridge.reset({ seed });
        }, { seed: scenario.seed }),
        actionTimeout,
        "bridge.reset()"
      )));
      await flushBrowserTasks(pages);
      const resetBaseline = await readBridgeSnapshot(
        page,
        0,
        null,
        -1,
        actionTimeout
      );
      eventSeq = resetBaseline.latestEventSeq;
      eventEpoch = resetBaseline.latestEventEpoch;
      eventSignature = resetBaseline.latestEventSignature;
      bridgeReady = true;
    } catch (error) {
      addRunnerDiagnostic(`Browser setup failed: ${errorMessage(error)}`);
    }

    if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });

    for (const [actionIndex, step] of scenario.steps.entries()) {
      activeActionIndex = actionIndex;
      activeFrameIndex = null;
      diagnosticElapsedMs = elapsedMs;
      const actionId = stepActionId(step);
      const samples: TimelineSample[] = [];
      const stepEvents: GameEvent[] = [];
      let latestBridge: GameObservation | null = null;

      const captureTimelineSample = async (sampleFrameIndex?: number) => {
        try {
          const bridgeSnapshot = await readBridgeSnapshot(
            page,
            eventSeq,
            eventSignature,
            eventEpoch,
            actionTimeout
          );
          eventSeq = bridgeSnapshot.latestEventSeq;
          eventEpoch = bridgeSnapshot.latestEventEpoch;
          eventSignature = bridgeSnapshot.latestEventSignature;
          latestBridge = bridgeSnapshot.bridge;
          stepEvents.push(...bridgeSnapshot.events);
          const sample = timelineSample(
            bridgeSnapshot,
            scenarioSamples.length,
            actionIndex,
            elapsedMs,
            sampleFrameIndex
          );
          samples.push(sample);
          scenarioSamples.push(sample);
        } catch (error) {
          addRunnerDiagnostic(
            `Timeline sample failed: ${errorMessage(error)}`
          );
        }
      };

      if (bridgeReady) {
        try {
          if (step.kind === "input") {
            await performAction(
              page,
              secondaryPage,
              publicCase,
              step.action_id,
              actionTimeout
            );
            await flushBrowserTasks(pages);
            if (step.advance_ms > 0) await captureTimelineSample();
            diagnosticElapsedMs = elapsedMs + step.advance_ms;
            await advanceScenarioTime(pages, scenario.clock.mode, step.advance_ms);
            elapsedMs += step.advance_ms;
            await captureTimelineSample();
          } else if (step.kind === "advance_time") {
            await captureTimelineSample();
            diagnosticElapsedMs = elapsedMs + step.advance_ms;
            await advanceScenarioTime(pages, scenario.clock.mode, step.advance_ms);
            elapsedMs += step.advance_ms;
            await captureTimelineSample();
          } else if (step.kind === "advance_frames") {
            activeFrameIndex = frameIndex;
            await captureTimelineSample(frameIndex);
            for (let frame = 1; frame <= step.frames; frame += 1) {
              frameIndex += 1;
              activeFrameIndex = frameIndex;
              diagnosticElapsedMs = elapsedMs + step.frame_ms;
              await advanceScenarioTime(pages, scenario.clock.mode, step.frame_ms);
              elapsedMs += step.frame_ms;
              if (frame % step.sample_every === 0 || frame === step.frames) {
                await captureTimelineSample(frameIndex);
              }
            }
          } else {
            const reloadPage = step.actor === "secondary" ? secondaryPage : page;
            if (!reloadPage) {
              throw new Error("Reload requires a secondary browser page");
            }
            await reloadPage.reload({
              waitUntil: "domcontentloaded",
              timeout: navigationTimeout
            });
            await reloadPage.waitForFunction(
              (acceptMissing) => {
                const bridge = window.__GAMETESTLAB__;
                return Boolean(
                  bridge &&
                  (bridge.protocol === "gametestlab/2" ||
                    (acceptMissing && bridge.protocol === undefined)) &&
                  bridge.isReady()
                );
              },
              acceptMissingBridgeProtocol,
              { timeout: navigationTimeout }
            );
            if (acceptMissingBridgeProtocol) {
              await reloadPage.evaluate(() => {
                const bridge = window.__GAMETESTLAB__ as
                  | (typeof window.__GAMETESTLAB__ & { protocol?: "gametestlab/2" })
                  | undefined;
                if (bridge && bridge.protocol === undefined) {
                  Object.defineProperty(bridge, "protocol", {
                    configurable: false,
                    enumerable: true,
                    value: "gametestlab/2",
                    writable: false
                  });
                }
              });
            }
            await flushBrowserTasks(pages);
            if (reloadPage === page) {
              eventSeq = 0;
              eventEpoch = -1;
              eventSignature = null;
            }
            await captureTimelineSample();
          }
        } catch (error) {
          addRunnerDiagnostic(
            `Step ${actionId} failed: ${errorMessage(error)}`
          );
        }
      }

      let snapshot: BrowserSnapshot = {
        bridge: null,
        events: [],
        ui: {},
        canvas: {},
        latestEventSeq: eventSeq,
        latestEventEpoch: eventEpoch,
        latestEventSignature: eventSignature
      };
      if (bridgeReady) {
        try {
          snapshot = await readBrowserSnapshot(
            page,
            eventSeq,
            eventSignature,
            eventEpoch,
            actionTimeout,
            publicCase.game.selectors
          );
          eventSeq = snapshot.latestEventSeq;
          eventEpoch = snapshot.latestEventEpoch;
          eventSignature = snapshot.latestEventSignature;
          latestBridge = snapshot.bridge;
          stepEvents.push(...snapshot.events);
          snapshot.bridge = latestBridge;
          snapshot.events = stepEvents;
        } catch (error) {
          addRunnerDiagnostic(`Evidence capture failed: ${errorMessage(error)}`);
        }
      }
      if (!snapshot.bridge && latestBridge) snapshot.bridge = latestBridge;
      snapshot.events = stepEvents;

      let screenshot: string | null = null;
      if (evidenceDirectory && !page.isClosed()) {
        const screenshotPath = resolve(
          evidenceDirectory,
          `${publicCase.id}-action-${String(actionIndex).padStart(2, "0")}.png`
        );
        if (!isInsidePath(resolve(evidenceDirectory), screenshotPath)) {
          throw new Error("screenshot path escaped the evidence directory");
        }
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

      const actionDiagnostics = diagnostics.slice(traceDiagnosticCursor);
      traceDiagnosticCursor = diagnostics.length;
      const actionConsole = consoleRecords.slice(traceConsoleCursor);
      traceConsoleCursor = consoleRecords.length;
      const actionPageErrors = pageErrors.slice(tracePageErrorCursor);
      tracePageErrorCursor = pageErrors.length;
      const actionNetwork = networkRecords.slice(traceNetworkCursor);
      traceNetworkCursor = networkRecords.length;
      const actionRuntimeErrors = actionDiagnostics.map(
        (diagnostic) => `${diagnostic.source}: ${diagnostic.message}`
      );
      const checkpointDiagnostics = step.checkpoints.length > 0
        ? diagnostics.slice(observationDiagnosticCursor)
        : [];
      if (step.checkpoints.length > 0) {
        observationDiagnosticCursor = diagnostics.length;
      }
      const checkpointRuntimeErrors = checkpointDiagnostics.map(
        (diagnostic) => `${diagnostic.source}: ${diagnostic.message}`
      );
      const runtimeErrorEvidence = checkpointDiagnostics.map((diagnostic) => ({
        source: diagnostic.source,
        message: `${diagnostic.source}: ${diagnostic.message}`,
        action_index: diagnostic.action_index,
        frame_index: diagnostic.frame_index,
        elapsed_ms: diagnostic.elapsed_ms
      }));
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
          samples: [...scenarioSamples],
          runtime_errors: checkpointRuntimeErrors,
          runtime_error_evidence: runtimeErrorEvidence,
          evidence
        });
      }

      trace.push({
        schema_version: publicCase.schema_version === "gametestlab.case.v3"
          ? "gametestlab.trace.v3"
          : "gametestlab.trace.v2",
        case_id: publicCase.id,
        scenario_id: scenario.id,
        seed: scenario.seed,
        clock: scenario.clock,
        action_index: actionIndex,
        action_id: actionId,
        step_kind: step.kind,
        checkpoint_ids: step.checkpoints,
        elapsed_ms: elapsedMs,
        samples,
        bridge: snapshot.bridge,
        ui: snapshot.ui,
        canvas: snapshot.canvas,
        game_events: snapshot.events,
        console: actionConsole,
        page_errors: actionPageErrors,
        network: actionNetwork,
        diagnostics: actionDiagnostics,
        runtime_errors: actionRuntimeErrors,
        screenshot,
        state_hash: hash
      });
    }

    const trailingDiagnostics = diagnostics.slice(observationDiagnosticCursor);
    const lastObservation = observations.at(-1);
    if (lastObservation && trailingDiagnostics.length > 0) {
      lastObservation.runtime_errors.push(
        ...trailingDiagnostics.map(
          (diagnostic) => `${diagnostic.source}: ${diagnostic.message}`
        )
      );
      lastObservation.runtime_error_evidence.push(
        ...trailingDiagnostics.map((diagnostic) => ({
          source: diagnostic.source,
          message: `${diagnostic.source}: ${diagnostic.message}`,
          action_index: diagnostic.action_index,
          frame_index: diagnostic.frame_index,
          elapsed_ms: diagnostic.elapsed_ms
        }))
      );
    }
  } finally {
    activeActionIndex = null;
    for (const targetPage of pages) {
      targetPage.off("console", onConsole);
      targetPage.off("pageerror", onPageError);
      targetPage.off("request", onRequest);
      targetPage.off("response", onResponse);
      targetPage.off("requestfailed", onRequestFailed);
      targetPage.off("websocket", onWebSocket);
    }
  }

  return {
    case_id: publicCase.id,
    scenario_id: scenario.id,
    url: gameURL.href,
    observations,
    trace,
    console: consoleRecords,
    page_errors: pageErrors,
    network: networkRecords,
    diagnostics
  };
}
