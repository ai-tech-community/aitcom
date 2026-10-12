import { describe, expect, it } from "vitest";

import { isPublishableJobTitle } from "./startup-job-boards";
import { isNoindexOpenJob, openJobRobots } from "./job-indexability";

const SHORT = "a".repeat(199);
const LONG = "a".repeat(200);

describe("isNoindexOpenJob", () => {
  it("noindexes a description under 200 characters, including empty", () => {
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: SHORT }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: "" }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: null }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({
        title: "Employee Login for US Jobs",
        descriptionText: null,
      }),
    ).toBe(true);
  });

  it("indexes a 200 character description with a publishable title", () => {
    expect(
      isNoindexOpenJob({ title: "Staff Engineer", descriptionText: LONG }),
    ).toBe(false);
  });

  it("noindexes a long description whose title the existing filter rejects", () => {
    expect(isPublishableJobTitle("View Job")).toBe(false);
    expect(isPublishableJobTitle("United States (Remote)")).toBe(false);
    expect(isNoindexOpenJob({ title: "View Job", descriptionText: LONG })).toBe(
      true,
    );
    expect(
      isNoindexOpenJob({
        title: "United States (Remote)",
        descriptionText: LONG,
      }),
    ).toBe(true);
    // #438's filter still accepts this live junk title. Do not add a second filter.
    expect(isPublishableJobTitle("Employee Login for US Jobs")).toBe(true);
  });

  it("becomes indexable once the description reaches 200 characters", () => {
    const title = "Staff Engineer";
    expect(isNoindexOpenJob({ title, descriptionText: SHORT })).toBe(true);
    expect(isNoindexOpenJob({ title, descriptionText: LONG })).toBe(false);
  });

  it("counts the trimmed description", () => {
    expect(
      isNoindexOpenJob({
        title: "Staff Engineer",
        descriptionText: `  ${SHORT}  `,
      }),
    ).toBe(true);
    expect(
      isNoindexOpenJob({
        title: "Staff Engineer",
        descriptionText: `  ${LONG}  `,
      }),
    ).toBe(false);
  });
});

describe("openJobRobots", () => {
  it("noindexes a closed role even when the description is long", () => {
    expect(
      openJobRobots({
        status: "closed",
        title: "Staff Engineer",
        descriptionText: LONG,
      }),
    ).toEqual({ index: false, follow: true });
  });

  it("noindexes a thin or junk open role and indexes a full one", () => {
    expect(
      openJobRobots({
        status: "open",
        title: "Staff Engineer",
        descriptionText: SHORT,
      }),
    ).toEqual({ index: false, follow: true });
    expect(
      openJobRobots({
        status: "open",
        title: "View Job",
        descriptionText: LONG,
      }),
    ).toEqual({ index: false, follow: true });
    expect(
      openJobRobots({
        status: "open",
        title: "Staff Engineer",
        descriptionText: LONG,
      }),
    ).toEqual({ index: true, follow: true });
  });
});
