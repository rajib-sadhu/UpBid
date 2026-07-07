import { describe, it, expect, beforeEach } from "vitest";
import { pickQueueFrom, toggleAssignSkip, clearAssignSkips } from "./assignment.js";
import { money } from "../lib/money.js";

const rules = {
  maxPlayersPerTeam: 10,
  unsoldPrice: money("0.5"),
  creditPerTeam: money("50"),
};

const team = (id: string, name: string, playerCount: number, picks = 0, committed = "0") => ({
  id,
  playerCount,
  picks,
  committedAmount: money(committed),
  franchise: { name },
});

const none = new Set<string>();

describe("pickQueueFrom (assignment pick rotation)", () => {
  it("first round: entry order is most free slots first", () => {
    const teams = [team("a", "Alpha", 6), team("b", "Bravo", 2), team("c", "Charlie", 4)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["b", "c", "a"]);
  });

  it("breaks entry-order ties alphabetically by franchise name", () => {
    const teams = [team("z", "Zulu", 3), team("a", "Alpha", 3), team("m", "Mike", 3)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["a", "m", "z"]);
  });

  it("alternates one by one: a pick sends the team to the back of the round", () => {
    // Entry: Bravo 2 players, Alpha 6 → order Bravo, Alpha. Bravo picks once —
    // even though Bravo still has the most free slots, Alpha is up next.
    const teams = [team("a", "Alpha", 6), team("b", "Bravo", 3, 1)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["a", "b"]);
  });

  it("keeps the fixed entry order round after round", () => {
    // Both teams have picked twice → next round repeats the entry order.
    const teams = [team("a", "Alpha", 8, 2), team("b", "Bravo", 4, 2)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["b", "a"]);
  });

  it("counts force-assigned players as consumed turns (picks include both kinds)", () => {
    // Alpha was force-fed 3 players; Bravo self-picked 1 → Bravo is ahead.
    const teams = [team("a", "Alpha", 5, 3), team("b", "Bravo", 5, 1)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["b", "a"]);
  });

  it("drops teams at the squad cap and the rest continue in order", () => {
    const teams = [team("a", "Alpha", 10, 4), team("b", "Bravo", 9, 4)];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["b"]);
  });

  it("drops teams that cannot afford the unsold price", () => {
    // 49.60 committed + 0.5 unsold > 50 credit → out; 49.50 + 0.5 = 50 → still in.
    const teams = [team("a", "Alpha", 1, 0, "49.60"), team("b", "Bravo", 1, 0, "49.50")];
    expect(pickQueueFrom(teams, rules, none)).toEqual(["b"]);
  });

  it("drops skipped teams from the rotation", () => {
    const teams = [team("a", "Alpha", 1), team("b", "Bravo", 5)];
    expect(pickQueueFrom(teams, rules, new Set(["a"]))).toEqual(["b"]);
  });
});

describe("toggleAssignSkip", () => {
  beforeEach(() => clearAssignSkips("auc"));

  it("toggles a team out of and back into the rotation", () => {
    const teams = [team("a", "Alpha", 1), team("b", "Bravo", 1)];
    toggleAssignSkip("auc", "a");
    // The map is consulted through assignmentState in production; emulate here.
    expect(pickQueueFrom(teams, rules, new Set(["a"]))).toEqual(["b"]);
    toggleAssignSkip("auc", "a"); // second toggle = unskip (no throw, no residue)
  });
});
