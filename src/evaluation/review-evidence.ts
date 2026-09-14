/** Omit duplicated frame payloads, never the verdicts of a repeat. Raw evidence stays on disk. */
export function compactReviewEvidence(result: any) {
  return {
    task_id: result.task_id, input_hashes: result.input_hashes,
    aggregate: result.aggregate, contract: result.contract,
    scenarios: result.scenarios.map((s: any) => ({
      scenario_id: s.scenario_id, replay_index: s.replay_index, evaluation: s.evaluation
    })),
    omitted: "Per-scenario observations and browser payloads are omitted here; action states are supplied separately. All original observations and time samples remain in browser/result.json and events.jsonl."
  };
}
