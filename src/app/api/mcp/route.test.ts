// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKey = vi.fn<(db: unknown, raw: string) => Promise<unknown>>();
const checkRegistrationRateLimit =
  vi.fn<(ip: string) => { allowed: boolean; remaining: number }>();

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: (db: unknown, raw: string) => validateApiKey(db, raw),
}));
vi.mock("@/server/agent/rate-limit", () => ({
  checkRegistrationRateLimit: (ip: string) => checkRegistrationRateLimit(ip),
}));
vi.mock("@/server/api/root", () => ({ createCaller: vi.fn() }));
vi.mock("@/server/api/trpc", () => ({ createTRPCContext: vi.fn() }));

// The real tool servers load the Payload config, which needs a URL to parse;
// db access itself is mocked above, so nothing ever connects.
process.env.DATABASE_URL ??=
  "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";

const { POST } = await import("./route");

function listTools(headers: Record<string, string> = {}) {
  return POST(
    new Request("https://aitcommunity.org/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    }),
  );
}

describe("POST /api/mcp auth routing", () => {
  beforeEach(() => {
    validateApiKey.mockReset();
    checkRegistrationRateLimit
      .mockReset()
      .mockReturnValue({ allowed: true, remaining: 9 });
  });

  it("serves the registration tools when no key is sent", async () => {
    const res = await listTools();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { tools: { name: string }[] };
    };
    expect(body.result.tools.map((t) => t.name)).toContain("register-agent");
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it("answers 401 invalid_token when a sent key does not validate", async () => {
    validateApiKey.mockResolvedValue(null);

    const res = await listTools({ Authorization: "Bearer ait_revoked" });

    expect(validateApiKey).toHaveBeenCalledWith({}, "ait_revoked");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="aitcommunity", error="invalid_token"',
    );
    expect(await res.json()).toMatchObject({ error: "invalid_token" });
  });

  it("rate-limits bad keys on the same per-IP budget as registration", async () => {
    validateApiKey.mockResolvedValue(null);
    checkRegistrationRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
    });

    const res = await listTools({
      Authorization: "Bearer ait_guess",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });

    expect(checkRegistrationRateLimit).toHaveBeenCalledWith("203.0.113.7");
    expect(res.status).toBe(429);
  });
});
