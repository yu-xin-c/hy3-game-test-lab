/** Model of the explicitly stated three-stage rules, not generated game code. */
export function stageRuleReference(brief: string) {
  const order = /正确顺序固定为“([^”]+)”/.exec(brief)?.[1]?.split(" → ");
  const required = ["每完成一段增加10分并推进 progress", "顺序错误会清空 progress 并扣1条生命", "progress=3、score=30", "初始2条生命，第二次错误操作时立即失败", "Restart 恢复0进度、0分、2条生命"];
  if (!order || order.length !== 3 || required.some(text => !brief.includes(text))) return null;
  let state: Record<string, unknown> = { status: "menu", progress: 0, score: 0, lives: 2 };
  const snapshot = () => structuredClone(state);
  return { order, snapshot, input(action: string) {
    if (["RESTART", "RESTART_KEY"].includes(action)) { state = { status: "menu", progress: 0, score: 0, lives: 2 }; return snapshot(); }
    if (action === "START") { if (state.status === "menu") state.status = "playing"; return snapshot(); }
    if (action === "JOIN") return snapshot(); // connected count is outside this rule model.
    if (!["STAGE_1", "STAGE_2", "STAGE_3", "WRONG"].includes(action)) throw new Error(`Unsupported stage input ${action}`);
    if (state.status !== "playing") return snapshot();
    if (action === `STAGE_${Number(state.progress) + 1}`) {
      state.progress = Number(state.progress) + 1;
      if (typeof state.score === "number") state.score += 10;
      if (state.progress === 3) { state.status = "won"; state.score = 30; }
    } else {
      // Partial-progress mistakes do not explicitly specify score restoration.
      if (Number(state.progress) > 0) delete state.score;
      state.progress = 0;
      state.lives = Number(state.lives) - 1;
      if (state.lives === 0) state.status = "lost";
    }
    return snapshot();
  } };
}
