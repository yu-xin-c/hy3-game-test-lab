export interface GridClaim {
  symbol: string;
  claimed: { x: number; y: number };
  actual: { x: number; y: number }[];
  valid: boolean;
}

/** Compare the plan's last explicit coordinate for each unique map symbol to the brief's ASCII map. */
export function checkGridMapClaims(brief: string, implementation: string): GridClaim[] {
  const match = brief.match(/```text\s*\n([#A-Z.\n]+)```/);
  if (!match) throw new Error("No ASCII grid in public brief");
  const rows = match[1]!.trim().split("\n");
  if (rows.some(row => row.length !== rows[0]!.length)) throw new Error("Non-rectangular public grid");
  const positions = new Map<string, { x: number; y: number }[]>();
  rows.forEach((row, y) => [...row].forEach((symbol, x) => {
    if (symbol === "#" || symbol === ".") return;
    positions.set(symbol, [...(positions.get(symbol) ?? []), { x, y }]);
  }));
  const claims = new Map<string, { x: number; y: number }>();
  for (const found of implementation.matchAll(/\b([A-Z])\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)) {
    // Later explicit corrections supersede earlier tentative coordinates.
    claims.set(found[1]!, { x: Number(found[2]), y: Number(found[3]) });
  }
  for (const found of implementation.matchAll(/['"]([A-Z])['"]\s*=\s*[^'";\n]*?\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)) {
    // Also accept plan prose such as 'S'=起点(1,1). Repeated symbols like
    // 'C'=金币(3,1)(1,3) are excluded below because their map position is not unique.
    if (!claims.has(found[1]!)) claims.set(found[1]!, { x: Number(found[2]), y: Number(found[3]) });
  }
  return [...claims].filter(([symbol]) => positions.get(symbol)?.length === 1).map(([symbol, claimed]) => {
    const actual = positions.get(symbol)!;
    return { symbol, claimed, actual, valid: actual.some(point => point.x === claimed.x && point.y === claimed.y) };
  });
}
