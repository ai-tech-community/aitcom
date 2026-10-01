import { describe, expect, it } from "vitest";
import { joinReturnPath } from "./join-community-link";

describe("joinReturnPath", () => {
  it("adds the join param and keeps the rest of the URL", () => {
    expect(joinReturnPath("/en/communities?q=ml", "acme")).toBe(
      "/en/communities?q=ml&join=acme",
    );
    expect(joinReturnPath("/en/communities/acme", "acme")).toBe(
      "/en/communities/acme?join=acme",
    );
  });

  it("replaces an earlier join param", () => {
    expect(joinReturnPath("/en/communities?join=old", "new")).toBe(
      "/en/communities?join=new",
    );
  });
});
