import { expect, it } from "vitest";
import { decodeCodeBuddyResponse } from "../../src/llm/codebuddy";
it("normalizes streamed public text and tool provenance without exposing thinking", () => {
  const text = [
    { type: "assistant", message: { role: "assistant", model: "hy3", content: [{ type: "thinking", thinking: "private fixture content" }, { type: "text", text: "public plan" }, { type: "tool_use", id: "one", name: "Write", input: { file_path: "game.js", content: "x" } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "one", content: "ok" }] } },
    { type: "result", is_error: false, result: "done" }
  ].map(m => JSON.stringify(m)).join("\n");
  const messages = decodeCodeBuddyResponse(text);
  expect(JSON.stringify(messages)).not.toContain("private fixture content");
  expect(messages).toContainEqual(expect.objectContaining({ type: "function_call", name: "Write" }));
  expect(messages).toContainEqual({ type: "function_call_result", callId: "one", status: "completed" });
  expect(messages.at(-1).is_error).toBe(false);
});
it("rejects truncated streams and preserves failed tool results", () => {
  expect(() => decodeCodeBuddyResponse('{"type":')).toThrow();
  const m = decodeCodeBuddyResponse(JSON.stringify({ message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", is_error: true }] } }));
  expect(m[0].status).toBe("failed");
});
