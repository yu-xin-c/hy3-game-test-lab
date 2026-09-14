import { describe, expect, it } from "vitest";
import { checkFirstRoundPlayback } from "../../src/evaluation/playback-timing";

const event = (seq: number, tick: number, type: string) => ({ seq, tick, type });
const obs = (tick: number, epoch: number, events: ReturnType<typeof event>[]) => ({
  probe: { tick, event_epoch: epoch, state: { status: "playing", phase: "input", score: 0 } }, events
});
const step = (n: number, after: ReturnType<typeof obs>) => ({ step: n, before: after, after });
describe("first-round playback rule", () => {
  it("uses the new session start and locates premature transition and input separately", () => {
    const old = [event(1, 100, "game_started")];
    const current = [event(1, 400, "game_reset"), event(2, 400, "game_started"), event(3, 1300, "input_phase_started")];
    const result = checkFirstRoundPlayback({ steps: [step(1, obs(100, 1, old)), step(5, obs(1350, 2, current)),
      step(6, obs(1350, 2, [...current, event(4, 1350, "signal_correct")]))] });
    expect(result.first_observed_step).toBe(5);
    expect(result.violations.map(v => [v.step, v.early_by_ms])).toEqual([[5, 300], [6, 250]]);
  });
  it("does not count unexercised menu as a clean game", () => {
    expect(checkFirstRoundPlayback({ steps: [step(0, obs(100, 1, [event(1, 0, "game_reset")]))] }).verdict).toBe("not_exercised");
  });
  it("allows the boundary tolerance and later rounds", () => {
    const events = [event(1, 100, "game_started"), event(2, 1268, "input_phase_started"), event(3, 1600, "signal_correct")];
    expect(checkFirstRoundPlayback({ steps: [step(0, obs(1600, 1, events))] }).violations).toEqual([]);
  });
  it("invalidates prior start after reset without another start", () => {
    const events = [event(1, 100, "game_started"), event(2, 400, "game_reset"), event(3, 1000, "input_phase_started")];
    expect(checkFirstRoundPlayback({ steps: [step(0, obs(1000, 1, events))] }).violations).toEqual([]);
  });
  it("rejects malformed traces and invalid rule parameters", () => {
    expect(() => checkFirstRoundPlayback({ steps: [step(0, obs(100, 1, [event(1, 200, "game_started")]))] })).toThrow();
    expect(() => checkFirstRoundPlayback({ steps: [] }, 100, 100)).toThrow();
  });
});
