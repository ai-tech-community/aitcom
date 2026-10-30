import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordGlobalDigestOptOut = vi.hoisted(() => vi.fn());
const recordStoryEmailOptOut = vi.hoisted(() => vi.fn());
const removeSubscription = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({}));

vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/magazines/subscriptions/service", () => ({
  removeSubscription,
}));

vi.mock("@/server/notifications/digest-optout", () => ({
  recordGlobalDigestOptOut,
}));
vi.mock("@/server/notifications/story-email-optout", () => ({
  recordStoryEmailOptOut,
}));

import { POST } from "./route";
import { signUnsubscribeToken } from "@/server/notifications/unsubscribe-token";

const SECRET = "route-test-secret";

function post(body: string, token?: string) {
  const url = new URL("https://www.aitcommunity.org/api/email/unsubscribe");
  if (token) url.searchParams.set("t", token);
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recordGlobalDigestOptOut.mockResolvedValue(undefined);
  recordStoryEmailOptOut.mockResolvedValue(undefined);
  removeSubscription.mockResolvedValue(undefined);
  vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", SECRET);
  vi.stubEnv("BETTER_AUTH_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/email/unsubscribe", () => {
  it("a magazine link removes that subscription", async () => {
    const token = signUnsubscribeToken(
      { subscriptionId: "subscription-1", scope: "magazine" },
      SECRET,
    );
    const res = await POST(post("List-Unsubscribe=One-Click", token));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(removeSubscription).toHaveBeenCalledExactlyOnceWith(
      db,
      "subscription-1",
    );
    expect(recordGlobalDigestOptOut).not.toHaveBeenCalled();
    expect(recordStoryEmailOptOut).not.toHaveBeenCalled();
  });

  it("redirects a confirmed magazine unsubscribe to the done page", async () => {
    const token = signUnsubscribeToken(
      { subscriptionId: "subscription-2", scope: "magazine" },
      SECRET,
    );
    const res = await POST(
      post(`t=${encodeURIComponent(token)}&confirm=unsubscribe&locale=nl`),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://www.aitcommunity.org/nl/unsubscribe?done=1&kind=magazine",
    );
    expect(removeSubscription).toHaveBeenCalledWith(db, "subscription-2");
    expect(recordGlobalDigestOptOut).not.toHaveBeenCalled();
    expect(recordStoryEmailOptOut).not.toHaveBeenCalled();
  });

  it("writes a global digest opt-out for a one-click post", async () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    const res = await POST(post("List-Unsubscribe=One-Click", token));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(recordGlobalDigestOptOut).toHaveBeenCalledWith("user-1");
    expect(recordStoryEmailOptOut).not.toHaveBeenCalled();
  });

  it("writes the story email opt-out for a story unsubscribe link", async () => {
    const token = signUnsubscribeToken(
      { userId: "user-3", scope: "story" },
      SECRET,
    );
    const res = await POST(
      post(`t=${encodeURIComponent(token)}&confirm=unsubscribe&locale=en`),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://www.aitcommunity.org/en/unsubscribe?done=1&kind=story",
    );
    expect(recordStoryEmailOptOut).toHaveBeenCalledWith("user-3");
    expect(recordGlobalDigestOptOut).not.toHaveBeenCalled();
  });

  it("redirects the confirm form after opting out", async () => {
    const token = signUnsubscribeToken(
      { userId: "user-2", scope: "digest" },
      SECRET,
    );
    const res = await POST(
      post(`t=${encodeURIComponent(token)}&confirm=unsubscribe&locale=nl`),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://www.aitcommunity.org/nl/unsubscribe?done=1",
    );
    expect(recordGlobalDigestOptOut).toHaveBeenCalledWith("user-2");
  });

  it("does nothing for a bad token or a post without the one-click signal", async () => {
    const token = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    expect(
      (await POST(post("List-Unsubscribe=One-Click", "nope"))).status,
    ).toBe(400);
    expect((await POST(post("", token))).status).toBe(400);
    expect(recordGlobalDigestOptOut).not.toHaveBeenCalled();
  });

  it("returns 400 when the opt-out cannot be stored", async () => {
    recordGlobalDigestOptOut.mockRejectedValue(new Error("fk"));
    const token = signUnsubscribeToken(
      { userId: "missing", scope: "digest" },
      SECRET,
    );
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = await POST(post("List-Unsubscribe=One-Click", token));
    expect(res.status).toBe(400);
    logged.mockRestore();
  });

  it("returns 500 when no signing secret is configured", async () => {
    vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const res = await POST(post("List-Unsubscribe=One-Click", "whatever"));
    expect(res.status).toBe(500);
    expect(recordGlobalDigestOptOut).not.toHaveBeenCalled();
  });
});
