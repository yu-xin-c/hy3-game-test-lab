import { z } from "zod";

export const GameEventSchema = z.object({
  seq: z.number().int().positive(),
  tick: z.number().int().nonnegative(),
  type: z.string().min(1),
  payload: z.unknown().optional()
}).passthrough();

export const GameObservationSchema = z.object({
  tick: z.number().int().nonnegative(),
  status: z.enum(["menu", "playing", "won", "lost"]),
  state: z.record(z.string(), z.unknown()),
  event_epoch: z.number().int().nonnegative(),
  latest_event_seq: z.number().int().nonnegative()
}).strict();

export interface GameEvent {
  seq: number;
  tick: number;
  type: string;
  payload?: unknown;
}

export interface GameObservation {
  tick: number;
  status: "menu" | "playing" | "won" | "lost";
  state: Record<string, unknown>;
  event_epoch: number;
  latest_event_seq: number;
}

function assertJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} is not a finite number`);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} is not JSON-serializable`);
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a cycle`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, ancestors)
    );
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain plain JSON objects`);
    }
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function parseGameObservation(value: unknown): GameObservation {
  const observation = GameObservationSchema.parse(value);
  assertJsonValue(observation.state, "observation.state", new Set());
  return observation;
}

export function parseGameEvents(value: unknown): GameEvent[] {
  const events = z.array(GameEventSchema).parse(value);
  for (const [index, event] of events.entries()) {
    const previous = events[index - 1];
    if (event.seq !== index + 1) {
      throw new Error("complete event log seq values must be contiguous from one");
    }
    if (previous && event.tick < previous.tick) {
      throw new Error("event ticks must be monotonic within an event epoch");
    }
    if (event.payload !== undefined) {
      assertJsonValue(event.payload, `events[${index}].payload`, new Set());
    }
  }
  return events;
}

export function assertEventEpochDidNotRegress(
  previousEpoch: number,
  currentEpoch: number
): void {
  if (currentEpoch < previousEpoch) {
    throw new Error(
      `bridge event_epoch regressed from ${previousEpoch} to ${currentEpoch}`
    );
  }
}

export interface GameTestLabBridge {
  protocol: "gametestlab/2";
  isReady(): boolean;
  reset(options: { seed: number }): Promise<void> | void;
  observe(): Promise<GameObservation> | GameObservation;
  getEvents(options: { afterSeq: number }): Promise<GameEvent[]> | GameEvent[];
}

declare global {
  interface Window {
    __GAMETESTLAB__?: GameTestLabBridge;
  }
}
