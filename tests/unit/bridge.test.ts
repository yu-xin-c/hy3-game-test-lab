import { describe, expect, it } from "vitest";
import {
  assertEventEpochDidNotRegress,
  parseGameEvents,
  parseGameObservation
} from "../../src/runtime/bridge";

describe("game bridge boundary", () => {
  it("accepts JSON-safe observations and ordered events", () => {
    expect(parseGameObservation({
      tick: 2,
      status: "playing",
      state: { player: { x: 10 }, flags: [true, null] },
      event_epoch: 1,
      latest_event_seq: 2
    }).tick).toBe(2);
    expect(parseGameEvents([
      { seq: 1, tick: 1, type: "game_started" },
      { seq: 2, tick: 2, type: "player_moved", payload: { x: 10 } }
    ])).toHaveLength(2);
  });

  it("rejects malformed or non-serializable evidence", () => {
    expect(() => parseGameObservation({
      tick: "2",
      status: "playing",
      state: {},
      event_epoch: 0,
      latest_event_seq: 0
    })).toThrow();
    expect(() => parseGameObservation({
      tick: 0,
      status: "playing",
      state: { score: Number.NaN },
      event_epoch: 0,
      latest_event_seq: 0
    })).toThrow(/finite number/);
    expect(() => parseGameEvents([
      { seq: 1, tick: 0, type: "first" },
      { seq: 1, tick: 0, type: "duplicate" }
    ])).toThrow(/contiguous/);
    expect(() => parseGameEvents([
      { seq: 1, tick: 2, type: "first" },
      { seq: 2, tick: 1, type: "time-travel" }
    ])).toThrow(/monotonic/);
    expect(() => assertEventEpochDidNotRegress(9, 8)).toThrow(/regressed/);
    expect(() => assertEventEpochDidNotRegress(9, 9)).not.toThrow();
    expect(() => assertEventEpochDidNotRegress(9, 10)).not.toThrow();
  });
});
