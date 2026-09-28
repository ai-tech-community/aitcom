import { describe, expect, it } from "vitest";

import { isStartupHomepageUniqueViolation } from "./homepage-conflict";

describe("isStartupHomepageUniqueViolation", () => {
  it("matches a Neon unique violation on startup_homepage_idx", () => {
    const error = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "startup_homepage_idx"',
      ),
      { code: "23505", constraint: "startup_homepage_idx" },
    );
    expect(isStartupHomepageUniqueViolation(error)).toBe(true);
  });

  it("matches the constraint name when it is only in the message", () => {
    expect(
      isStartupHomepageUniqueViolation(
        new Error(
          'duplicate key value violates unique constraint "startup_homepage_idx"',
        ),
      ),
    ).toBe(true);
  });

  it("matches a Drizzle query error wrapped around the Postgres cause", () => {
    const cause = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "startup_homepage_idx"',
      ),
      {
        code: "23505",
        constraint: "startup_homepage_idx",
        detail: "Key (homepage)=(https://example.com) already exists.",
      },
    );
    expect(
      isStartupHomepageUniqueViolation(
        Object.assign(new Error("Failed query: insert into ..."), { cause }),
      ),
    ).toBe(true);
  });

  it("does not treat a slug unique violation as a homepage skip", () => {
    const error = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "startup_slug_idx"',
      ),
      { code: "23505", constraint: "startup_slug_idx" },
    );
    expect(isStartupHomepageUniqueViolation(error)).toBe(false);
  });

  it("does not swallow unrelated failures", () => {
    expect(
      isStartupHomepageUniqueViolation(new Error("connection reset")),
    ).toBe(false);
    expect(isStartupHomepageUniqueViolation(null)).toBe(false);
    expect(isStartupHomepageUniqueViolation("startup_homepage_idx")).toBe(
      false,
    );
  });
});
