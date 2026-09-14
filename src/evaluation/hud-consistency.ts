/** Cross-surface observation; does not decide which surface is wrong. */
export function compareStatusHud(state: unknown, samples: { text: string | null; visible: boolean }[]) {
  const known = ["menu", "playing", "won", "lost"];
  if (typeof state !== "string" || !known.includes(state)) return { result: "unavailable", reason: "unknown_state" };
  if (samples.length !== 1) return { result: "unavailable", reason: "missing_or_ambiguous_selector" };
  const sample = samples[0]!;
  if (!sample.visible || sample.text === null) return { result: "unavailable", reason: "hud_not_visible" };
  const displayed = sample.text.trim().replace(/\s+/g, " ").toLowerCase();
  if (!known.includes(displayed)) return { result: "unavailable", reason: "unrecognized_label" };
  return { result: displayed === state ? "match" : "mismatch", state, displayed };
}
