import { expect, it } from "vitest";
import { keyDoorReference } from "../../src/evaluation/key-door-reference";
const map = ["########", "#S..D.E#", "#.#.#..#", "#K..T..#", "########"];
it("blocks the locked door and reaches the exit only after acquiring the key", () => {
  const model = keyDoorReference(map);
  for (const a of ["START", "RIGHT", "RIGHT", "RIGHT"]) model.input(a);
  expect(model.snapshot().state.player).toEqual({ x: 3, y: 1 });
  for (const a of ["LEFT", "LEFT", "DOWN", "DOWN", "UP", "UP", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"]) model.input(a);
  expect(model.snapshot().state).toMatchObject({ status: "won", player: { x: 6, y: 1 }, has_key: true, door_open: true });
});
it("respawns after a trap but does not invent terminal restoration ordering", () => {
  const model = keyDoorReference(map);
  model.input("START");
  const trap = ["DOWN", "DOWN", "RIGHT", "RIGHT", "RIGHT"];
  for (const a of trap) model.input(a);
  expect(model.snapshot()).toMatchObject({ state: { lives: 1, player: { x: 1, y: 1 }, has_key: false }, unknown_fields: [] });
  for (const a of trap) model.input(a);
  expect(model.snapshot()).toMatchObject({ state: { lives: 0, status: "lost" }, unknown_fields: ["player.x", "player.y", "has_key", "door_open"] });
  model.input("RESTART");
  expect(model.snapshot()).toMatchObject({ state: { status: "menu", lives: 2, has_key: false }, unknown_fields: [] });
});
it("rejects invalid maps and unknown controls", () => {
  expect(() => keyDoorReference(["bad"])).toThrow();
  expect(() => keyDoorReference(map).input("TELEPORT")).toThrow();
});
