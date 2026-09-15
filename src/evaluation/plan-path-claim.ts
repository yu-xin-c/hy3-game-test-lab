type Event = { type: string; tick: number; payload?: { support_id?: string } };
type Snapshot = { observation: { tick: number; status: string }; events: Event[] };
export type PlannedPathTrial = { inputs: { expected_tick: number; before: Snapshot }[]; final: Snapshot };

/** false = direct counterexample; null = insufficient evidence, never full certification. */
export function checkPlatformPathClaim(trial: PlannedPathTrial): false | null {
  for (const input of trial.inputs) {
    const { observation, events } = input.before;
    if (observation.tick === input.expected_tick) continue;
    // Earlier inputs matched. A terminal loss before the next scheduled input
    // disproves the claimed path; the stopped clock is an effect, not bad timing.
    if (observation.status === "lost" && observation.tick < input.expected_tick &&
        events.some(e => e.type === "game_lost" && e.tick < input.expected_tick)) return false;
    return null;
  }
  if (trial.final.observation.status === "lost") return false;
  const keyIndex = trial.final.events.findIndex(e => e.type === "key_collected");
  if (keyIndex < 0) return null;
  const landed = trial.final.events.slice(0, keyIndex).filter(e => e.type === "player_landed")
    .map(e => e.payload?.support_id).filter(s => s !== "ground");
  return JSON.stringify(landed) !== JSON.stringify(["platform-1", "platform-2", "end"]) ? false : null;
}
