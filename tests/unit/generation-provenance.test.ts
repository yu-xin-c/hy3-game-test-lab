import { describe, expect, it } from "vitest";
import { locateExcerpt, locateRuntimeFrame, reconstructGeneration, type GenerationCall } from "../../src/evaluation/generation-provenance";

const write = (content: string): GenerationCall => ({ tool: "Write", status: "completed", within_generated_directory: true, file: "game.js", arguments: { content } });
const edit = (old_string: string, new_string: string): GenerationCall => ({ tool: "Edit", status: "completed", within_generated_directory: true, file: "game.js", arguments: { old_string, new_string } });
describe("generation provenance", () => {
  it("attributes changed and unchanged code to different tool steps", () => {
    const r = reconstructGeneration([write("speed=1;\nreset();"), { tool: "Read", status: "completed" }, edit("speed=1", "speed=2")], { "game.js": "speed=2;\nreset();" });
    expect(r.complete).toBe(true);
    expect(locateExcerpt(r, "game.js", "speed=2")?.contributing_tool_steps).toEqual([3]);
    expect(locateExcerpt(r, "game.js", "reset()")?.contributing_tool_steps).toEqual([1]);
  });
  it("does not certify missing history or mismatched final code", () => {
    expect(reconstructGeneration([], { "game.js": "x" }).complete).toBe(false);
    const r = reconstructGeneration([write("x")], { "game.js": "y" });
    expect(locateExcerpt(r, "game.js", "x")).toBeNull();
  });
  it("rejects ambiguous edits even when a later write matches the final code", () => {
    const r = reconstructGeneration([write("xx"), edit("x", "y"), write("yy")], { "game.js": "yy" });
    expect(r.complete).toBe(false);
  });
  it("does not attribute a failed edit and rejects ambiguous excerpts", () => {
    const r = reconstructGeneration([write("xx"), { ...edit("x", "y"), status: "failed" }], { "game.js": "xx" });
    expect(r.complete).toBe(true);
    expect(locateExcerpt(r, "game.js", "x")).toBeNull();
  });
  it("replays replace_all and records the repair as the current owner", () => {
    const r = reconstructGeneration([write("a+a"), { ...edit("a", "b"), arguments: { old_string: "a", new_string: "b", replace_all: true } }, edit("b+b", "a+a")], { "game.js": "a+a" });
    expect(r.complete).toBe(true);
    expect(locateExcerpt(r, "game.js", "a+a")?.contributing_tool_steps).toEqual([3]);
  });
  it("maps a browser stack frame to the exact generated write without calling it the reasoning root cause", () => {
    const source = "function reset() {\n  return observe();\n}\n";
    const r = reconstructGeneration([write(source)], { "game.js": source });
    const located = locateRuntimeFrame(r, "ReferenceError: observe is not defined\n    at reset (http://127.0.0.1:63840/game.js:2:10)");
    expect(located).toMatchObject({ file: "game.js", line: 2, column: 10, contributing_tool_step: 1, source_line: "  return observe();" });
    expect(locateRuntimeFrame(r, "at other (http://127.0.0.1:63840/untracked.js:2:10)")).toBeNull();
  });
});
