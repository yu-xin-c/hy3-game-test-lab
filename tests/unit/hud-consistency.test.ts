import { describe, it, expect } from "vitest";
import { compareStatusHud } from "../../src/evaluation/hud-consistency";
describe("status cross-check", () => {
  it("compares recognized labels without choosing an authoritative surface", () => {
    expect(compareStatusHud("lost", [{ text: " Playing ", visible: true }]).result).toBe("mismatch");
    expect(compareStatusHud("won", [{ text: " WON\n", visible: true }]).result).toBe("match");
  });
  it("does not invent a comparison from missing, hidden, ambiguous or custom text", () => {
    for (const samples of [[], [{ text: "Playing", visible: false }], [{ text: "胜利！", visible: true }], [{ text: "Won", visible: true }, { text: "Lost", visible: true }]]) {
      expect(compareStatusHud("won", samples).result).toBe("unavailable");
    }
  });
});
