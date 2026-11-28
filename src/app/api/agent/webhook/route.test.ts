import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, limit, insert, set, updateResult } = vi.hoisted(() => ({
  select: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  set: vi.fn(),
  updateResult: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: (fields: unknown) => {
      select(fields);
      return { from: () => ({ where: () => ({ limit }) }) };
    },
    insert: () => ({ values: insert }),
    update: () => ({
      set: (values: unknown) => {
        set(values);
        return { where: () => ({ returning: updateResult }) };
      },
    }),
  },
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({ agentId: "agent1", ownerId: "user1" }),
}));
vi.mock("@/server/agent/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
}));
vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: async () => ({ ok: true }),
}));

import { agentWebhooks } from "@/server/db/schema";
import { GET, PUT } from "./route";

const url = "https://example.com/hook";
const categories = ["inbox"];

function request(body?: { secret?: string }) {
  return new Request("https://app.test/api/agent/webhook", {
    method: body ? "PUT" : "GET",
    headers: { authorization: "Bearer fake-agent-key" },
    body: body && JSON.stringify({ url, categories, ...body }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  limit.mockResolvedValue([{ id: "wh1" }]);
  updateResult.mockResolvedValue([{ id: "wh1" }]);
});

describe("agent webhook REST responses", () => {
  it("returns the newly stored secret when registering a webhook", async () => {
    limit.mockResolvedValue([]);

    const response = await PUT(request({}));
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result).toEqual({
      registered: true,
      secret: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ secret: result.secret }),
    );
  });

  it("returns the supplied replacement on rotation and only metadata on later reads", async () => {
    const secret = "replacement-secret";
    const rotation = await PUT(request({ secret }));

    expect(rotation.ok).toBe(true);
    await expect(rotation.json()).resolves.toEqual({
      registered: true,
      secret,
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ secret }));

    const metadata = {
      url,
      categories,
      isEnabled: true,
      consecutiveFailures: 0,
      hasSecret: true,
    };
    limit.mockResolvedValue([metadata]);

    const read = await GET(request());

    expect(read.ok).toBe(true);
    await expect(read.json()).resolves.toEqual({
      exists: true,
      webhook: metadata,
    });
    const fields = select.mock.lastCall?.[0] as Record<string, unknown>;
    expect(fields).toHaveProperty("hasSecret");
    expect(fields).not.toHaveProperty("secret");
    expect(Object.values(fields)).not.toContain(agentWebhooks.secret);
  });

  it("returns just an acknowledgement on an ordinary update", async () => {
    const response = await PUT(request({}));

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ registered: true });
    expect(set.mock.lastCall?.[0]).not.toHaveProperty("secret");
  });
});
