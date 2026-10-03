import { describe, expect, it } from "vitest";
import { CollectorStop, failureDetailFor, userMessageFor } from "./errors";

describe("userMessageFor", () => {
  it("uses a CollectorStop's own message", () => {
    const stop = new CollectorStop(
      "robots_disallowed",
      "failed",
      "Not allowed.",
    );
    expect(userMessageFor(stop)).toBe("Not allowed.");
  });

  it.each([
    [
      Object.assign(new Error("x"), { name: "TimeoutError" }),
      "A site took too long to answer.",
    ],
    [
      Object.assign(new Error("x"), { name: "AbortError" }),
      "A site took too long to answer.",
    ],
    [
      new Error("Refusing to fetch URL: private address"),
      "This address cannot be reached from our servers.",
    ],
    [new Error("Response too large"), "A page was larger than the 5 MB limit."],
    [new Error("Too many redirects"), "A page redirected too many times."],
  ])("maps known errors to plain words", (err, message) => {
    expect(userMessageFor(err)).toBe(message);
  });

  it("never leaks an unknown error's text", () => {
    expect(userMessageFor(new Error("ECONNRESET at 10.0.0.3:5432"))).toBe(
      "Something went wrong while collecting. Try again later.",
    );
  });
});

describe("failureDetailFor", () => {
  it("uses a CollectorStop's own detail", () => {
    const stop = new CollectorStop("error", "failed", "Not a feed.", {
      code: "not_a_feed",
    });
    expect(failureDetailFor(stop)).toEqual({ code: "not_a_feed" });
  });

  it.each([
    ["robots_disallowed", "robots_disallowed"],
    ["robots_unreachable", "robots_unreachable"],
    ["blocked_domain", "blocked_domain"],
    ["site_refused", "site_refused"],
    ["worker_lost", "worker_lost"],
    ["error", "generic"],
  ] as const)(
    "falls back to the stop reason %s when a stop has no detail",
    (reason, code) => {
      expect(
        failureDetailFor(new CollectorStop(reason, "failed", "x")),
      ).toEqual({ code });
    },
  );

  it.each([
    [Object.assign(new Error("x"), { name: "TimeoutError" }), "timeout"],
    [Object.assign(new Error("x"), { name: "AbortError" }), "timeout"],
    [
      new Error("Refusing to fetch URL: private address"),
      "unreachable_address",
    ],
    [new Error("Response too large"), "too_large"],
    [new Error("Too many redirects"), "redirect_loop"],
  ])("maps known errors to the same codes as their messages", (err, code) => {
    expect(failureDetailFor(err)).toEqual({ code });
  });

  it("maps anything else to generic", () => {
    expect(failureDetailFor(new Error("ECONNRESET"))).toEqual({
      code: "generic",
    });
    expect(failureDetailFor("boom")).toEqual({ code: "generic" });
  });
});
