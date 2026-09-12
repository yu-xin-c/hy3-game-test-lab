import { chromium, type Browser, type Page } from "@playwright/test";
import { z } from "zod";
import type { GameManifest } from "../contracts/generation";
import { parseGameEvents, parseGameObservation } from "./bridge";
import { startStaticServer } from "./static-server";

export const GeneratedGameSmokeResultSchema = z.object({
  schema_version: z.literal("gametestlab.generated-smoke.v2"),
  passed: z.literal(true),
  checked_at: z.string().datetime(),
  browser: z.literal("chromium"),
  browser_version: z.string().min(1),
  event_epochs: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative()
  ]),
  exercised_control_ids: z.array(z.string().min(1)).min(1),
  runtime_errors: z.array(z.string()),
  external_requests: z.array(z.string().url())
}).strict();

export type GeneratedGameSmokeResult = z.infer<
  typeof GeneratedGameSmokeResultSchema
>;

export interface GeneratedGameSmokeOptions {
  gameDirectory: string;
  manifest: GameManifest;
  timeoutMs?: number;
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

async function readBridgeSnapshot(page: Page, timeoutMs: number) {
  const snapshot = await withHardTimeout(
    page.evaluate(async () => {
      const bridge = window.__GAMETESTLAB__;
      if (!bridge) throw new Error("window.__GAMETESTLAB__ is unavailable");
      return {
        observation: await bridge.observe(),
        events: await bridge.getEvents({ afterSeq: 0 })
      };
    }),
    timeoutMs,
    "smoke bridge.observe()/getEvents()"
  );
  const observation = parseGameObservation(snapshot.observation);
  const events = parseGameEvents(snapshot.events);
  if ((events.at(-1)?.seq ?? 0) !== observation.latest_event_seq) {
    throw new Error("smoke: latest_event_seq does not match complete log");
  }
  if (events.some((event) => event.tick > observation.tick)) {
    throw new Error("smoke: bridge event tick exceeds observation tick");
  }
  return { observation, events };
}

async function resetBridge(page: Page, seed: number, timeoutMs: number) {
  await withHardTimeout(
    page.evaluate(async ({ resetSeed }) => {
      const bridge = window.__GAMETESTLAB__;
      if (!bridge) throw new Error("window.__GAMETESTLAB__ is unavailable");
      await bridge.reset({ seed: resetSeed });
    }, { resetSeed: seed }),
    timeoutMs,
    "smoke bridge.reset()"
  );
  return readBridgeSnapshot(page, timeoutMs);
}

async function performManifestControl(
  page: Page,
  control: GameManifest["controls"][number],
  timeoutMs: number
): Promise<boolean> {
  // Camera fixtures and secondary pages belong to the formal playthrough
  // environment. The smoke gate still exercises every usable primary-page
  // control and verifies that the package loads and exposes a valid bridge.
  if (control.device === "camera" || control.actor === "secondary") return false;
  if (control.device === "keyboard") {
    if (!control.code) {
      throw new Error(`smoke: keyboard control ${control.action_id} has no code`);
    }
    if (control.key_event === "down") await page.keyboard.down(control.code);
    else if (control.key_event === "up") await page.keyboard.up(control.code);
    else await page.keyboard.press(control.code);
    return true;
  }

  let x: number;
  let y: number;
  if (control.selector) {
    const target = page.locator(control.selector).first();
    if (!(await target.isVisible())) return false;
    if (control.device === "mouse") {
      await target.click({ timeout: timeoutMs });
      return true;
    }
    const box = await target.boundingBox({ timeout: timeoutMs });
    if (!box) return false;
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    if (control.x_ratio === undefined || control.y_ratio === undefined) {
      throw new Error(
        `smoke: ${control.device} control ${control.action_id} has no target`
      );
    }
    const canvas = page.locator("canvas").first();
    const box = await canvas.count() > 0
      ? await canvas.boundingBox({ timeout: timeoutMs })
      : null;
    if (box) {
      x = box.x + box.width * control.x_ratio;
      y = box.y + box.height * control.y_ratio;
    } else {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("smoke: browser page has no viewport");
      x = viewport.width * control.x_ratio;
      y = viewport.height * control.y_ratio;
    }
  }

  if (control.device === "touch") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  return true;
}

export async function smokeGeneratedGame(
  options: GeneratedGameSmokeOptions
): Promise<GeneratedGameSmokeResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive finite number");
  }
  const server = await startStaticServer({
    rootDirectory: options.gameDirectory,
    exposure: "isolated-root"
  });
  const executablePath = process.env.GAMETESTLAB_CHROMIUM_EXECUTABLE;
  let browser: Browser | undefined;
  const runtimeErrors: string[] = [];
  const externalRequests: string[] = [];
  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {})
    });
    const context = await browser.newContext({
      viewport: options.manifest.viewport,
      deviceScaleFactor: 1,
      ...(options.manifest.controls.some((control) => control.device === "touch")
        ? { hasTouch: true }
        : {})
    });
    try {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => {
        runtimeErrors.push(`pageerror: ${error.name}: ${error.message}`);
      });
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== server.origin) {
          externalRequests.push(request.url());
        }
      });
      page.on("websocket", (socket) => externalRequests.push(socket.url()));
      page.on("response", (response) => {
        if (response.status() >= 400) {
          runtimeErrors.push(`network: ${response.status()} ${response.url()}`);
        }
      });

      await page.goto(`${server.origin}/${options.manifest.entry_path}`, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      await page.waitForFunction(
        () =>
          window.__GAMETESTLAB__?.protocol === "gametestlab/2" &&
          window.__GAMETESTLAB__.isReady(),
        undefined,
        { timeout: timeoutMs }
      );
      const parsed = [
        await resetBridge(page, 17, timeoutMs),
        await resetBridge(page, 17, timeoutMs)
      ];
      const first = parsed[0]?.observation;
      const second = parsed[1]?.observation;
      if (!first || !second || second.event_epoch <= first.event_epoch) {
        throw new Error("smoke: reset did not increment event_epoch");
      }

      const exercisedControlIds: string[] = [];
      for (const control of options.manifest.controls) {
        const exercised = await withHardTimeout(
          performManifestControl(page, control, timeoutMs),
          timeoutMs,
          `smoke control ${control.action_id}`
        );
        if (!exercised) continue;
        exercisedControlIds.push(control.action_id);
        await withHardTimeout(
          page.evaluate(async () => {
            await Promise.resolve();
          }),
          timeoutMs,
          `smoke post-control ${control.action_id}`
        );
        await readBridgeSnapshot(page, timeoutMs);
      }
      if (exercisedControlIds.length === 0) {
        throw new Error("smoke: no manifest control could be exercised");
      }
      await withHardTimeout(
        page.waitForTimeout(Math.min(25, timeoutMs)),
        timeoutMs,
        "smoke post-input settle"
      );
      await readBridgeSnapshot(page, timeoutMs);

      if (runtimeErrors.length > 0 || externalRequests.length > 0) {
        throw new Error([
          ...runtimeErrors,
          ...externalRequests.map((url) => `external request: ${url}`)
        ].join("\n"));
      }

      return GeneratedGameSmokeResultSchema.parse({
        schema_version: "gametestlab.generated-smoke.v2",
        passed: true,
        checked_at: new Date().toISOString(),
        browser: "chromium",
        browser_version: browser.version(),
        event_epochs: [first.event_epoch, second.event_epoch],
        exercised_control_ids: exercisedControlIds,
        runtime_errors: runtimeErrors,
        external_requests: externalRequests
      });
    } finally {
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}
