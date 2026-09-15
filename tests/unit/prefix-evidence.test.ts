import { it, expect } from "vitest";
import { isolatePrefixEvidence } from "../../src/evaluation/prefix-evidence";
const state = { observation: { status: "lost", state: { player: { x: 58, y: 528, vx: 3, vy: 0 } }, latest_event_seq: 11 }, events: [{ type: "game_lost" }] };
it("isolates the start assertion without targets or later states", () => {
  const p = { id: "target-rush-prefix-1", steps: [{ id: 1, verification: "start" }], scope: "步骤2", repetitions: [{ repeat: 1, trials: [{ trial: 1, start: state, targets: [42], states: [state] }] }] };
  const result = isolatePrefixEvidence(p);
  expect(result.steps).toEqual(p.steps);
  expect(result.scope).not.toContain("步骤2");
  expect(result.repetitions[0].trials[0]).not.toHaveProperty("targets");
  expect(result.repetitions[0].trials[0]).not.toHaveProperty("states");
  expect(result.repetitions[0].trials[0].start.observation).toEqual({ status: "lost" });
});
it("keeps replay values but removes platform loss, events and expected jump ticks", () => {
  const result = isolatePrefixEvidence({ id: "platform-rescue-prefix-1", steps: [{ id: 1 }], repetitions: [{ repeat: 1, trials: [{ trial: 1, start: state, inputs: [{ expected_tick: 20, before: state }], final: state, elapsed_ms: 3200 }] }] });
  const json = JSON.stringify(result);
  for (const forbidden of ["game_lost", "expected_tick", "步骤2", '"status"', '"events"']) expect(json).not.toContain(forbidden);
  expect(result.repetitions[0].trials[0].samples[0].value).toEqual({ player: { x: 58, y: 528, vx: 3, vy: 0 }, latest_event_seq: 11 });
});
it("does not alter two-step evidence or mutate the source", () => {
  const p = { id: "platform-rescue-prefix-2", steps: [{ id: 1 }, { id: 2 }], repetitions: [state] };
  const result = isolatePrefixEvidence(p);
  expect(result).toEqual(p);
  expect(result).not.toBe(p);
});
