import { describe, expect, it } from "vitest";

import { isCelebrationRoute } from "./celebration-route";

describe("isCelebrationRoute", () => {
  it.each(["/", "/dashboard", "/members/u1", "/dashboard/agent", "/authors"])(
    "celebrates on %s",
    (path) => expect(isCelebrationRoute(path)).toBe(true),
  );

  it.each([
    "/auth",
    "/auth/signin",
    "/auth/signup/",
    "/dashboard/onboarding",
    "/dashboard/onboarding/questions",
  ])("waits on %s", (path) => expect(isCelebrationRoute(path)).toBe(false));
});
