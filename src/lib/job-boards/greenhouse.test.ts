import { describe, expect, it } from "vitest";
import fixture from "./fixtures/greenhouse.json";

import {
  greenhouseBoardName,
  greenhouseBoardUrl,
  parseGreenhouseBoard,
  recognizeGreenhouseBoard,
} from "./greenhouse";

describe("Greenhouse board addresses", () => {
  it.each([
    ["https://boards.greenhouse.io/acme", "acme"],
    ["https://job-boards.greenhouse.io/acme/", "acme"],
    ["https://boards.greenhouse.io/acme/jobs/123?gh_src=ref", "acme"],
    ["https://boards.greenhouse.io/embed/job_board?for=acme", "acme"],
    [
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
      "acme",
    ],
  ])("recognises %s", (address, name) => {
    expect(recognizeGreenhouseBoard(new URL(address))).toBe(name);
  });

  it.each([
    "http://boards.greenhouse.io/acme",
    "https://greenhouse.io/acme",
    "https://boards.greenhouse.io.evil.example/acme",
    "https://evil.example/boards.greenhouse.io/acme",
    "https://boards.greenhouse.io/",
    "https://boards.greenhouse.io/embed/job_board",
    "https://boards.greenhouse.io/acme/not-a-board",
    "https://boards-api.greenhouse.io/v1/boards/acme",
    "https://boards-api.greenhouse.io/v1/boards/acme/departments",
    "https://boards.greenhouse.io/a%2Fb",
    "https://boards.greenhouse.io/embed/job_board?for=../acme",
    "https://user:pass@boards.greenhouse.io/acme",
    "https://boards.greenhouse.io:8443/acme",
  ])("leaves %s unrecognised", (address) => {
    expect(recognizeGreenhouseBoard(new URL(address))).toBeNull();
  });

  it("accepts only a bounded board name and builds the public API address", () => {
    expect(greenhouseBoardName.parse(" acme-inc ")).toBe("acme-inc");
    for (const name of ["", "../acme", "acme/jobs", "a".repeat(101)]) {
      expect(greenhouseBoardName.safeParse(name).success).toBe(false);
    }
    expect(greenhouseBoardUrl("acme")).toBe(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
    );
  });
});

describe("parseGreenhouseBoard", () => {
  it("keeps the shared optional-field and date normalisation compatible", () => {
    expect(
      parseGreenhouseBoard({
        jobs: [
          {
            title: "Engineer",
            absolute_url: "https://example.com/jobs/1",
            location: { name: "  " },
            departments: [{ name: "  " }],
            first_published: "not a date",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Engineer",
        location: null,
        department: null,
        url: "https://example.com/jobs/1",
        postedAt: null,
      },
    ]);
  });
  it("reads a saved public Greenhouse response", () => {
    expect(parseGreenhouseBoard(fixture)).toEqual([
      {
        title: "Commercial Counsel",
        location: "Eastern Timezone",
        department: "Legal Team",
        url: "https://job-boards.greenhouse.io/greenhouse/jobs/8126988?gh_jid=8126988",
        postedAt: "2026-08-24T17:52:04.000Z",
      },
      {
        title: "Enterprise Account Executive",
        location: "London, United Kingdom",
        department: "Account Executive",
        url: "https://job-boards.greenhouse.io/greenhouse/jobs/8279752?gh_jid=8279752",
        postedAt: "2026-10-14T15:52:46.000Z",
      },
    ]);
  });
  it("reads the published fields and never turns an update into a posting date", () => {
    expect(
      parseGreenhouseBoard({
        jobs: [
          {
            title: " Research Engineer ",
            absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
            location: { name: "Amsterdam" },
            departments: [{ name: "Research" }, { name: "Engineering" }],
            updated_at: "2026-10-30T12:00:00Z",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Research Engineer",
        url: "https://boards.greenhouse.io/acme/jobs/1",
        location: "Amsterdam",
        department: "Research, Engineering",
        postedAt: null,
      },
    ]);
  });

  it("keeps optional fields empty and a supplied publication date", () => {
    expect(
      parseGreenhouseBoard({
        jobs: [
          {
            title: "Engineer",
            absolute_url: "https://example.com/jobs/1",
            first_published: "2026-10-02T10:00:00+02:00",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Engineer",
        url: "https://example.com/jobs/1",
        location: null,
        department: null,
        postedAt: "2026-10-02T08:00:00.000Z",
      },
    ]);
  });

  it("distinguishes an empty board from a broken response", () => {
    expect(parseGreenhouseBoard({ jobs: [] })).toEqual([]);
    for (const payload of [
      null,
      {},
      [],
      { jobs: {} },
      { jobs: [null] },
      { jobs: [{ title: "Engineer", absolute_url: "javascript:alert(1)" }] },
    ]) {
      expect(parseGreenhouseBoard(payload)).toBeNull();
    }
  });
});
