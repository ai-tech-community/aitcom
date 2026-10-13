import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as { user: { email: string } } | null,
  role: null as string | null,
  members: [] as Array<{
    userId: string;
    email: string;
    globalDigestOptOut: boolean;
    digest: { userId: string; sections: []; discovery: null } | null;
  }>,
  send: vi.fn(),
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: () => Promise.resolve(state.session),
}));

vi.mock("@/server/payload", () => ({
  getPayloadClient: () =>
    Promise.resolve({
      find: () =>
        Promise.resolve({
          docs: state.role ? [{ role: state.role }] : [],
        }),
    }),
}));

vi.mock("@/server/notifications/load-hub-digest", () => ({
  loadHubDigests: () => Promise.resolve(state.members),
}));

vi.mock("@/server/email", () => ({
  sendHubDigestEmail: (...args: unknown[]): Promise<boolean> =>
    state.send(...args) as Promise<boolean>,
}));

import { GET } from "./route";

const MEMBER_EMAIL = "member@example.com";

function preview(search: string) {
  return GET(
    new Request(`https://www.aitcommunity.org/api/dev/digest-preview${search}`),
  );
}

beforeEach(() => {
  state.session = { user: { email: "greg@klevox.com" } };
  state.role = "admin";
  state.members = [
    {
      userId: "user-1",
      email: MEMBER_EMAIL,
      globalDigestOptOut: false,
      digest: { userId: "user-1", sections: [], discovery: null },
    },
  ];
  state.send.mockReset();
  state.send.mockResolvedValue(true);
  vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", "preview-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/dev/digest-preview", () => {
  it("refuses a signed-out caller and a non-admin", async () => {
    state.session = null;
    expect((await preview("?userId=user-1")).status).toBe(401);

    state.session = { user: { email: "ada@example.com" } };
    state.role = "editor";
    expect((await preview("?userId=user-1&send=greg")).status).toBe(403);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("returns the digest html and does not send", async () => {
    const res = await preview("?userId=user-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("Your weekly AIT digest");
    expect(state.send).not.toHaveBeenCalled();
  });

  it("test-sends only to greg@klevox.com", async () => {
    const res = await preview("?userId=user-1&send=greg");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      to: "greg@klevox.com",
      wouldSend: true,
    });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send.mock.calls[0]?.[0]).toBe("greg@klevox.com");
    expect(state.send.mock.calls.flat()).not.toContain(MEMBER_EMAIL);
  });

  it("refuses a forged recipient and does not send", async () => {
    expect(
      (await preview("?userId=user-1&send=greg&to=member@example.com")).status,
    ).toBe(400);
    expect(
      (await preview("?userId=user-1&send=member@example.com")).status,
    ).toBe(400);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("does not claim a digest send", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/dev/digest-preview/route.ts"),
      "utf8",
    );
    expect(src).not.toContain("digestSendLog");
    expect(src).not.toContain("digest_send_log");
  });
});
