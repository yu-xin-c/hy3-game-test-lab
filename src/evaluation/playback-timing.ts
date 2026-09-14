import { z } from "zod";

const eventSchema = z.object({ seq: z.number().int().positive(), tick: z.number().finite(), type: z.string() });
const observationSchema = z.object({
  probe: z.object({ tick: z.number().finite(), event_epoch: z.number().int(),
    state: z.object({ status: z.string(), phase: z.string(), score: z.number().finite() }) }),
  events: z.array(eventSchema)
});
const traceSchema = z.object({ steps: z.array(z.object({ step: z.number().int().nonnegative(),
  before: observationSchema, after: observationSchema })) });

/** Checks only the first-round playback after each real game_started event.
 * Public duration, not observed sequence length, sets the expected deadline.
 * A reset invalidates the preceding session. No model verdict enters this rule.
 */
export function checkFirstRoundPlayback(input: unknown, durationMs = 1200, toleranceMs = 32) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(toleranceMs) || toleranceMs < 0 || toleranceMs >= durationMs) {
    throw new Error("Invalid playback timing rule");
  }
  const trace = traceSchema.parse(input);
  const violations: { step: number; type: string; event_tick: number; expected_end_tick: number; early_by_ms: number }[] = [];
  let epoch: number | null = null;
  let start: number | null = null;
  let seen = 0;
  let starts = 0;
  let previousStep = -1;
  for (const step of trace.steps) {
    if (step.step <= previousStep) throw new Error("Non-increasing operation steps");
    previousStep = step.step;
    const obs = step.after;
    if (obs.probe.event_epoch !== epoch) {
      epoch = obs.probe.event_epoch;
      start = null;
      seen = 0;
    }
    let previousSeq = 0;
    let previousTick = -Infinity;
    for (const event of obs.events) {
      if (event.seq <= previousSeq || event.tick < previousTick || event.tick > obs.probe.tick) throw new Error("Invalid event order or future event");
      previousSeq = event.seq;
      previousTick = event.tick;
      if (event.seq <= seen) continue;
      seen = event.seq;
      if (event.type === "game_reset") start = null;
      if (event.type === "game_started") { start = event.tick; starts++; }
      if (start !== null && ["input_phase_started", "signal_correct", "signal_wrong"].includes(event.type)) {
        const end = start + durationMs;
        if (event.tick < end - toleranceMs) violations.push({ step: step.step,
          type: event.type === "input_phase_started" ? "premature_input_phase" : "input_accepted_during_playback",
          event_tick: event.tick, expected_end_tick: end, early_by_ms: end - event.tick });
      }
    }
  }
  return { scope: "first-round minimum playback duration only", duration_ms: durationMs, tolerance_ms: toleranceMs,
    observed_starts: starts, verdict: starts === 0 ? "not_exercised" : violations.length ? "violated" : "no_observed_violation",
    first_observed_step: violations[0]?.step ?? null, violations };
}
