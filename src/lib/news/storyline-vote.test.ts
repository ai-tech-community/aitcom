import { expect, it } from "vitest";
import {
  applyStorylineVote,
  storylineVoteChoice,
  storylineVoteValue,
} from "./storyline-vote";

it("maps one stored value to up, down, or no vote", () => {
  expect(storylineVoteValue("up")).toBe(1);
  expect(storylineVoteValue("down")).toBe(-1);
  expect(storylineVoteValue(null)).toBe(0);
  expect(storylineVoteChoice(1)).toBe("up");
  expect(storylineVoteChoice(-1)).toBe("down");
  expect(storylineVoteChoice("1")).toBe("up");
  expect(storylineVoteChoice(0)).toBeNull();
  expect(storylineVoteChoice(null)).toBeNull();
});

it("changes, replaces, and clears a vote without counting anyone else", () => {
  expect(applyStorylineVote({ score: 0, myVote: null }, "up")).toEqual({
    score: 1,
    myVote: "up",
  });
  expect(applyStorylineVote({ score: 4, myVote: "up" }, "down")).toEqual({
    score: 2,
    myVote: "down",
  });
  expect(applyStorylineVote({ score: 2, myVote: "down" }, null)).toEqual({
    score: 3,
    myVote: null,
  });
});
