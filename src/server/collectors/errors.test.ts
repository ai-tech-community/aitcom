import { describe, expect, it } from "vitest";
import { CollectorStop, userMessageFor } from "./errors";

describe("userMessageFor", () => {
  it("uses a CollectorStop's own message", () => {
    const stop = new CollectorStop("robots_disallowed", "failed", "Not allowed.");
    expect(userMessageFor(stop)).toBe("Not allowed.");
  });

  it.each([
    [Object.assign(new Error("x"), { name: "TimeoutError" }), "A site took too long to answer."],
    [Object.assign(new Error("x"), { name: "AbortError" }), "A site took too long to answer."],
    [new Error("Refusing to fetch URL: private address"), "This address cannot be reached from our servers."],
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
