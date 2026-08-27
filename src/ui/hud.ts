export interface HudState {
  score: number;
  status: "menu" | "playing" | "won" | "lost";
}

export function updateHud(root: ParentNode, state: HudState): void {
  const score = root.querySelector<HTMLElement>("[data-testid='score']");
  const status = root.querySelector<HTMLElement>("[data-testid='status']");
  if (!score || !status) {
    throw new Error("HUD elements are missing");
  }
  score.textContent = String(state.score);
  status.textContent = state.status;
}

