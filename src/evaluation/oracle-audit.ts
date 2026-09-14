import { z } from "zod";

export interface AuditAssertion { id: string; kind: string; path: string; expected: unknown; contexts: string[] }
/** Deduplicate identical predicates, retaining every scenario/checkpoint use. */
export function collectAuditAssertions(plan: any, oracle: any): AuditAssertion[] {
  const entries = new Map<string, AuditAssertion>();
  const add = (kind: string, path: string, expected: unknown, context: string) => {
    const key = JSON.stringify([kind, path, expected]);
    const found = entries.get(key);
    if (found) found.contexts.push(context);
    else entries.set(key, { id: `A${entries.size + 1}`, kind, path, expected, contexts: [context] });
  };
  for (const c of plan.controls) for (const [key, value] of Object.entries(c)) {
    if (key !== "action_id") add("control", `${c.action_id}.${key}`, value, c.action_id);
  }
  for (const scenario of oracle.scenarios) for (const cp of scenario.checkpoints) {
    for (const [channel, expectations] of Object.entries(cp.expected)) {
      if (["state", "ui", "ui_text", "state_tolerances"].includes(channel)) {
        for (const [path, value] of Object.entries(expectations as object)) add(channel, path, value, `${scenario.scenario_id}/${cp.id}`);
      } else if (Array.isArray(expectations)) {
        for (const value of expectations) add(channel, channel, value, `${scenario.scenario_id}/${cp.id}`);
      } else add(channel, channel, expectations, `${scenario.scenario_id}/${cp.id}`);
    }
  }
  return [...entries.values()];
}

export const AuditReviewSchema = z.object({ assertions: z.array(z.object({
  id: z.string(), verdict: z.enum(["supported", "unsupported", "ambiguous", "test_mechanics"]),
  public_quote: z.string().nullable(), reason: z.string()
})) });
export function parseAuditResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return JSON.parse(trimmed);
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```(?:\s|$)/i.exec(trimmed);
  if (!match || /^```/m.test(trimmed.slice(match[0].length))) throw new Error("Ambiguous audit JSON blocks");
  // Some providers append an explanation after a single JSON code fence.
  // Parse that explicit block only; never recover fragments from invalid JSON.
  return JSON.parse(match[1]!);
}
export function validateAuditReview(input: unknown, assertions: AuditAssertion[], publicText: string) {
  const parsed = AuditReviewSchema.parse(input);
  const remaining = new Set(assertions.map(a => a.id));
  for (const item of parsed.assertions) {
    if (!remaining.delete(item.id)) throw new Error(`Unknown or duplicate assertion ${item.id}`);
    if (item.public_quote !== null && (!item.public_quote.trim() || !publicText.includes(item.public_quote))) throw new Error(`Unmatched public quote ${item.id}`);
    if (item.verdict === "supported" && item.public_quote === null) throw new Error(`Missing supporting quote ${item.id}`);
  }
  if (remaining.size) throw new Error(`Missing ${remaining.size} assertion decisions`);
  return parsed;
}
