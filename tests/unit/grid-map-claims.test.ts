import { describe, expect, it } from "vitest";
import { checkGridMapClaims } from "../../src/evaluation/grid-map-claims";

const brief = "```text\n########\n#S..D.E#\n#.#.#..#\n#K..T..#\n########\n```";

describe("ASCII-map plan coordinates", () => {
  it("accepts the actual zero-based map position", () => {
    expect(checkGridMapClaims(brief, "S(1,1) K(1,3) D(4,1) T(4,3) E(6,1)").every(c => c.valid)).toBe(true);
  });
  it("uses the final explicit correction but still catches a wrong trap coordinate", () => {
    const claims = checkGridMapClaims(brief, "K(3,1) T(3,3) 修正为 K(1,3) T(3,3)");
    expect(claims.find(c => c.symbol === "K")?.valid).toBe(true);
    expect(claims.find(c => c.symbol === "T")).toMatchObject({ valid: false, claimed: { x: 3, y: 3 }, actual: [{ x: 4, y: 3 }] });
  });
  it("rejects malformed public grids", () => {
    expect(() => checkGridMapClaims("```text\n#S#\n##\n```", "S(1,0)")).toThrow("Non-rectangular");
  });
});
