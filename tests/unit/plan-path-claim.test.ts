import { describe, it, expect } from "vitest";
import { checkPlatformPathClaim, type PlannedPathTrial } from "../../src/evaluation/plan-path-claim";
const snapshot = (tick: number, status = "playing", events: PlannedPathTrial["final"]["events"] = []) => ({ observation: { tick, status }, events });
describe("original platform verification claim", () => {
  it("recognizes loss before a later scheduled jump as a counterexample", () => {
    const lost = snapshot(18, "lost", [{ type: "game_lost", tick: 17 }]);
    expect(checkPlatformPathClaim({ inputs: [{ expected_tick: 0, before: snapshot(0) }, { expected_tick: 20, before: lost }], final: lost })).toBe(false);
  });
  it("does not blame the game if an earlier live input had wrong timing", () => {
    expect(checkPlatformPathClaim({ inputs: [{ expected_tick: 0, before: snapshot(1) }, { expected_tick: 20, before: snapshot(18, "lost") }], final: snapshot(18, "lost") })).toBe(null);
  });
  it("does not turn a finite observation timeout into failure", () => {
    expect(checkPlatformPathClaim({ inputs: [{ expected_tick: 0, before: snapshot(0) }], final: snapshot(200) })).toBe(null);
  });
  it("detects key collection before the claimed landing sequence", () => {
    expect(checkPlatformPathClaim({ inputs: [], final: snapshot(60, "playing", [{ type: "key_collected", tick: 45 }]) })).toBe(false);
  });
  it("does not certify unsampled collision behavior even when the event order holds", () => {
    expect(checkPlatformPathClaim({ inputs: [], final: snapshot(150, "won", [
      ...["platform-1", "platform-2", "end"].map((support_id, tick) => ({ type: "player_landed", tick, payload: { support_id } })),
      { type: "key_collected", tick: 100 }, { type: "game_won", tick: 150 }
    ]) })).toBe(null);
  });
});
