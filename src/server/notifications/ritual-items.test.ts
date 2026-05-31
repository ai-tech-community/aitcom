import { describe, it, expect } from "vitest";
import { buildRitualItems, type EngageConfig } from "./ritual-items";

const ALL_ON: EngageConfig = {
  ritualRecap: true,
  ritualReminder: true,
  atRiskLine: true,
};

describe("buildRitualItems", () => {
  it("returns recap + reminder + at-risk line in order when all enabled", () => {
    const items = buildRitualItems({
      config: ALL_ON,
      recap: [{ title: "Show your work", replyCount: 8 }],
      reminders: [{ title: "Weekly standup", weekdayLabel: "Mon" }],
      recipientIsAtRisk: true,
      recipientName: "Sam",
    });
    expect(items).toEqual([
      "Show your work — 8 replies this week",
      "Up next: Weekly standup (Mon)",
      "We've missed you, Sam — jump back in",
    ]);
  });
  it("singularizes one reply", () => {
    const items = buildRitualItems({
      config: { ritualRecap: true, ritualReminder: false, atRiskLine: false },
      recap: [{ title: "Intro thread", replyCount: 1 }],
      reminders: [],
      recipientIsAtRisk: false,
      recipientName: "X",
    });
    expect(items).toEqual(["Intro thread — 1 reply this week"]);
  });
  it("omits each item when its toggle is off", () => {
    const items = buildRitualItems({
      config: { ritualRecap: false, ritualReminder: true, atRiskLine: false },
      recap: [{ title: "Hidden", replyCount: 3 }],
      reminders: [{ title: "Standup", weekdayLabel: "Tue" }],
      recipientIsAtRisk: true,
      recipientName: "Sam",
    });
    expect(items).toEqual(["Up next: Standup (Tue)"]);
  });
  it("omits the at-risk line when the recipient is not at risk", () => {
    const items = buildRitualItems({
      config: ALL_ON,
      recap: [],
      reminders: [],
      recipientIsAtRisk: false,
      recipientName: "Sam",
    });
    expect(items).toEqual([]);
  });
});
