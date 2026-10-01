import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import {
  JOIN_INTENT_TTL_MS,
  joinReturnPath,
  rememberJoinIntent,
  takeJoinIntent,
} from "./join-community-link";

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

describe("join intent", () => {
  afterEach(() => window.sessionStorage.clear());

  it("matches the slug this browser asked for, once", () => {
    rememberJoinIntent("acme", 1000);
    expect(takeJoinIntent("acme", 2000)).toBe(true);
    expect(takeJoinIntent("acme", 2000)).toBe(false);
  });

  it("refuses another slug, and consumes the record", () => {
    rememberJoinIntent("acme", 1000);
    expect(takeJoinIntent("evil", 2000)).toBe(false);
    expect(takeJoinIntent("acme", 2000)).toBe(false);
  });

  it("expires", () => {
    rememberJoinIntent("acme", 0);
    expect(takeJoinIntent("acme", JOIN_INTENT_TTL_MS)).toBe(false);
  });

  it("refuses when nothing was recorded", () => {
    expect(takeJoinIntent("acme")).toBe(false);
  });
});
