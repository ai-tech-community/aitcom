import { describe, expect, it } from "vitest";
import {
  filterSourceAttendees,
  registrationSource,
  registrationSourceTotals,
  sourceFilter,
  type SourceAttendee,
} from "./registration-source";
const rows: SourceAttendee[] = [
  {
    displayName: "Ada",
    email: null,
    profile: null,
    answers: [],
    registrationSource: "luma",
    status: "registered",
    checkedInAt: null,
  },
  {
    displayName: "Grace",
    email: null,
    profile: null,
    answers: [{ value: ["Agents"] }],
    registrationSource: "meetup",
    status: "attended",
    checkedInAt: "2026-10-14T10:00:00Z",
  },
  {
    displayName: "Cancelled",
    email: null,
    profile: null,
    answers: [],
    registrationSource: "luma",
    status: "cancelled",
    checkedInAt: null,
  },
  {
    displayName: "Historical",
    email: null,
    profile: null,
    answers: [],
    status: "waitlisted",
    checkedInAt: null,
  },
];
describe("organizer source views", () => {
  it("combines source, status and answer search for page and export", () => {
    expect(
      filterSourceAttendees(
        rows,
        ["attended", "registered"],
        "meetup",
        "AGENTS",
      ).map((row) => row.displayName),
    ).toEqual(["Grace"]);
    expect(filterSourceAttendees(rows, ["registered"], "meetup")).toEqual([]);
    expect(
      filterSourceAttendees(rows, ["waitlisted"], "direct_or_unknown").map(
        (row) => row.displayName,
      ),
    ).toEqual(["Historical"]);
  });
  it("excludes cancellations and updates source totals when check-in is undone", () => {
    expect(registrationSourceTotals(rows)).toEqual([
      { source: "luma", registrations: 1, checkedIn: 0 },
      { source: "eventbrite", registrations: 0, checkedIn: 0 },
      { source: "meetup", registrations: 1, checkedIn: 1 },
      { source: "direct_or_unknown", registrations: 1, checkedIn: 0 },
    ]);
    expect(
      registrationSourceTotals(
        rows.map((row) =>
          row.displayName === "Grace"
            ? { ...row, status: "registered", checkedInAt: null }
            : row,
        ),
      )[2],
    ).toEqual({ source: "meetup", registrations: 1, checkedIn: 0 });
  });
  it("does not invent a historical source or trust arbitrary filters", () => {
    expect(registrationSource("anything")).toBe("direct_or_unknown");
    expect(sourceFilter("anything")).toBe("all");
  });
});
