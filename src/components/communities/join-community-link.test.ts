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
    expect(takeJoinIntent("acme", 2000)).toEqual({ source: null });
    expect(takeJoinIntent("acme", 2000)).toBeNull();
  });

  it("refuses another slug, and consumes the record", () => {
    rememberJoinIntent("acme", 1000);
    expect(takeJoinIntent("evil", 2000)).toBeNull();
    expect(takeJoinIntent("acme", 2000)).toBeNull();
  });

  it("expires", () => {
    rememberJoinIntent("acme", 0);
    expect(takeJoinIntent("acme", JOIN_INTENT_TTL_MS)).toBeNull();
  });

  it("refuses when nothing was recorded", () => {
    expect(takeJoinIntent("acme")).toBeNull();
  });

  it("the source survives sign-in", () => {
    const source = { via: "magazine", magazineId: 1, issueId: 2 } as const;
    rememberJoinIntent("acme", 1000, source);
    expect(takeJoinIntent("acme", 2000)).toEqual({ source });
  });

  it("keeps an intent saved by the old shape", () => {
    window.sessionStorage.setItem(
      "ait:join-intent",
      JSON.stringify({ slug: "acme", at: 1000 }),
    );
    expect(takeJoinIntent("acme", 2000)).toEqual({ source: null });
  });

  it.each([null, "broken", { via: "magazine", magazineId: 1, issueId: 0 }])(
    "drops a malformed stored source without losing the intent: %j",
    (source) => {
      window.sessionStorage.setItem(
        "ait:join-intent",
        JSON.stringify({ slug: "acme", at: 1000, source }),
      );
      expect(takeJoinIntent("acme", 2000)).toEqual({ source: null });
    },
  );

  it.each(["null", "{", JSON.stringify({ slug: "acme", at: "1000" })])(
    "ignores malformed records: %s",
    (record) => {
      window.sessionStorage.setItem("ait:join-intent", record);
      expect(takeJoinIntent("acme", 2000)).toBeNull();
    },
  );
});
