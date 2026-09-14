import { z } from "zod";
const schema = z.object({
  viewport: z.object({ width: z.number().int().min(100).max(4096), height: z.number().int().min(100).max(4096) }),
  seed: z.literal(404), clock_epoch_ms: z.literal(1_700_000_000_000),
  initial_advance_ms: z.literal(100), post_action_advance_ms: z.literal(100)
});
export function explorationEnvironment(replay: { environment?: unknown } | null) {
  if (replay?.environment) return schema.parse(replay.environment);
  return schema.parse({ viewport: replay ? { width: 1000, height: 800 } : { width: 800, height: 600 },
    seed: 404, clock_epoch_ms: 1_700_000_000_000, initial_advance_ms: 100, post_action_advance_ms: 100 });
}
