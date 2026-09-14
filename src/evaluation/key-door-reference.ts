/** Independent rule model for the public Key Door Escape grid, not game code. */
export function keyDoorReference(map: string[]) {
  if (map.length !== 5 || map.some(row => row.length !== 8)) throw new Error("Expected public 8x5 map");
  const positions = (symbol: string) => map.flatMap((row, y) => [...row].flatMap((cell, x) => cell === symbol ? [{ x, y }] : []));
  for (const symbol of ["S", "K", "D", "T", "E"]) if (positions(symbol).length !== 1) throw new Error(`Expected one ${symbol}`);
  const spawn = positions("S")[0]!;
  const initial = () => ({ status: "menu", player: { ...spawn }, lives: 2, has_key: false, door_open: false });
  let state = initial();
  let unknown: string[] = [];
  const snapshot = () => ({ state: structuredClone(state), unknown_fields: [...unknown] });
  return {
    snapshot,
    input(action: string) {
      if (["RESTART", "RESTART_KEY"].includes(action)) { state = initial(); unknown = []; return snapshot(); }
      if (action === "START") { if (state.status === "menu") state.status = "playing"; return snapshot(); }
      const delta = ({ UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] } as Record<string, number[]>)[action];
      if (!delta) throw new Error(`Unsupported grid action ${action}`);
      if (state.status !== "playing") return snapshot();
      const next = { x: state.player.x + delta[0]!, y: state.player.y + delta[1]! };
      const cell = map[next.y]?.[next.x];
      if (!cell || cell === "#" || cell === "D" && !state.has_key) return snapshot();
      state.player = next;
      if (cell === "K") state.has_key = true;
      if (cell === "D") state.door_open = true;
      if (cell === "E" && state.door_open) state.status = "won";
      if (cell === "T") {
        state.lives--;
        if (state.lives === 0) {
          state.status = "lost";
          // Brief does not specify whether restoration precedes immediate loss.
          unknown = ["player.x", "player.y", "has_key", "door_open"];
        } else { state.player = { ...spawn }; state.has_key = false; state.door_open = false; }
      }
      return snapshot();
    }
  };
}
