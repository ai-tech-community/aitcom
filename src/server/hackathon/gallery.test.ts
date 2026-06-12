import { describe, it, expect } from "vitest";

import {
  submittedProjects,
  sortGallery,
  gallerySortKeys,
  safeArtifactHref,
} from "./gallery";

interface Row {
  teamId: string;
  name: string;
  submittedAt: Date | null;
  finalRank: number | null;
}

function row(
  teamId: string,
  name: string,
  submittedAt: string | null,
  finalRank: number | null = null,
): Row {
  return {
    teamId,
    name,
    submittedAt: submittedAt === null ? null : new Date(submittedAt),
    finalRank,
  };
}

describe("submittedProjects", () => {
  it("keeps only teams with a submission timestamp", () => {
    const rows = [
      row("a", "Alpha", "2026-06-01T10:00:00Z"),
      row("b", "Beta", null),
      row("c", "Gamma", "2026-06-02T10:00:00Z"),
    ];
    expect(submittedProjects(rows).map((t) => t.teamId)).toEqual(["a", "c"]);
  });

  it("returns empty when no team has submitted", () => {
    expect(submittedProjects([row("a", "Alpha", null)])).toEqual([]);
  });

  it("returns empty for no teams", () => {
    expect(submittedProjects([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const rows = [row("b", "Beta", null), row("a", "Alpha", "2026-06-01")];
    const copy = [...rows];
    submittedProjects(rows);
    expect(rows).toEqual(copy);
  });
});

describe("sortGallery", () => {
  it("sorts newest first by submission time", () => {
    const rows = [
      row("old", "Old", "2026-06-01T08:00:00Z"),
      row("new", "New", "2026-06-03T08:00:00Z"),
      row("mid", "Mid", "2026-06-02T08:00:00Z"),
    ];
    expect(sortGallery(rows, "newest").map((t) => t.teamId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("breaks newest ties by team name A–Z", () => {
    const rows = [
      row("b", "Bravo", "2026-06-01T08:00:00Z"),
      row("a", "Alpha", "2026-06-01T08:00:00Z"),
    ];
    expect(sortGallery(rows, "newest").map((t) => t.teamId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts by team name A–Z case-insensitively", () => {
    const rows = [
      row("c", "charlie", "2026-06-01"),
      row("a", "Alpha", "2026-06-03"),
      row("b", "Bravo", "2026-06-02"),
    ];
    expect(sortGallery(rows, "name").map((t) => t.teamId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("sorts by final rank ascending with unranked teams last", () => {
    const rows = [
      row("unranked", "Zed", "2026-06-04", null),
      row("third", "Third", "2026-06-01", 3),
      row("first", "First", "2026-06-02", 1),
      row("second", "Second", "2026-06-03", 2),
    ];
    expect(sortGallery(rows, "rank").map((t) => t.teamId)).toEqual([
      "first",
      "second",
      "third",
      "unranked",
    ]);
  });

  it("breaks rank ties (and unranked groups) by team name A–Z", () => {
    const rows = [
      row("ub", "Unranked B", "2026-06-01", null),
      row("ua", "Unranked A", "2026-06-02", null),
    ];
    expect(sortGallery(rows, "rank").map((t) => t.teamId)).toEqual([
      "ua",
      "ub",
    ]);
  });

  it("treats a missing submission time as oldest under newest sort", () => {
    // Defensive: the gallery only feeds submitted rows in, but the sort must
    // stay total if a null slips through.
    const rows = [
      row("none", "None", null),
      row("dated", "Dated", "2026-06-01"),
    ];
    expect(sortGallery(rows, "newest").map((t) => t.teamId)).toEqual([
      "dated",
      "none",
    ]);
  });

  it("breaks ties between two missing submission times by name", () => {
    // Two nulls must compare 0 (not NaN) so the name fallback kicks in.
    const rows = [row("b", "Bravo", null), row("a", "Alpha", null)];
    expect(sortGallery(rows, "newest").map((t) => t.teamId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [
      row("b", "Beta", "2026-06-02"),
      row("a", "Alpha", "2026-06-01"),
    ];
    const copy = [...rows];
    sortGallery(rows, "newest");
    expect(rows).toEqual(copy);
  });

  it("accepts ISO-string submission times (client-serialized rows)", () => {
    const rows = [
      {
        teamId: "old",
        name: "Old",
        submittedAt: "2026-06-01T08:00:00Z",
        finalRank: null,
      },
      {
        teamId: "new",
        name: "New",
        submittedAt: "2026-06-02T08:00:00Z",
        finalRank: null,
      },
    ];
    expect(sortGallery(rows, "newest").map((t) => t.teamId)).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("safeArtifactHref", () => {
  it("allows https URLs", () => {
    expect(safeArtifactHref("https://example.com/project")).toBe(
      "https://example.com/project",
    );
  });

  it("allows http URLs", () => {
    expect(safeArtifactHref("http://example.com")).toBe("http://example.com");
  });

  it("rejects javascript: URLs", () => {
    expect(safeArtifactHref("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(safeArtifactHref("data:text/html,<script>alert(1)</script>")).toBe(
      null,
    );
  });

  it("rejects vbscript: URLs", () => {
    expect(safeArtifactHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects unparseable garbage", () => {
    expect(safeArtifactHref("not a url at all")).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeArtifactHref(null)).toBeNull();
    expect(safeArtifactHref(undefined)).toBeNull();
  });
});

describe("gallerySortKeys", () => {
  it("offers newest and name before finalize", () => {
    expect(gallerySortKeys(false)).toEqual(["newest", "name"]);
  });

  it("adds rank once the hackathon is finalized", () => {
    expect(gallerySortKeys(true)).toEqual(["newest", "name", "rank"]);
  });
});
