import { describe, expect, it } from "vitest";
import { escapeLike } from "./escape-like";

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\now")).toBe("50\\%\\_off\\\\now");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLike("Jan van der Berg")).toBe("Jan van der Berg");
  });
});
