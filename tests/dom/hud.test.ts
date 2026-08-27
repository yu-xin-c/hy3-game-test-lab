import { beforeEach, describe, expect, it } from "vitest";
import { updateHud } from "../../src/ui/hud";

describe("updateHud", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="game">
        <output data-testid="score"></output>
        <output data-testid="status"></output>
      </main>
    `;
  });

  it("renders score and status into the supplied DOM root", () => {
    const root = document.querySelector("#game");
    if (!root) throw new Error("test fixture root is missing");

    updateHud(root, { score: 2, status: "won" });

    expect(root.querySelector("[data-testid='score']")?.textContent).toBe("2");
    expect(root.querySelector("[data-testid='status']")?.textContent).toBe(
      "won"
    );
  });

  it("does not mutate matching HUD nodes outside the supplied root", () => {
    const outside = document.createElement("output");
    outside.dataset.testid = "score";
    outside.textContent = "outside";
    document.body.prepend(outside);
    const root = document.querySelector("#game");
    if (!root) throw new Error("test fixture root is missing");

    updateHud(root, { score: 7, status: "playing" });

    expect(outside.textContent).toBe("outside");
  });

  it("fails loudly when either required HUD node is absent", () => {
    document.body.innerHTML = "<main><output data-testid='score'></output></main>";

    expect(() => updateHud(document, { score: 0, status: "menu" })).toThrow(
      "HUD elements are missing"
    );
  });
});
