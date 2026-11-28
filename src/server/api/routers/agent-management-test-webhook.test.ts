import { createHmac } from "crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PinnedTransport from "@/server/net/pinned-transport";

type Row = Record<string, unknown>;

const dbHooks = vi.hoisted(() => ({
  selectResults: [] as Row[][],
  updateResults: [] as Row[][],
  updates: [] as Array<{ values: Row; where: SQL }>,
  inserts: [] as Row[],
}));

vi.mock("@/server/db", () => {
  function project(rows: Row[], fields?: Row) {
    return rows.map((row) =>
      fields
        ? Object.fromEntries(
            Object.keys(fields).map((key) => [
              key,
              key === "hasSecret" ? Boolean(row.secret) : row[key],
            ]),
          )
        : row,
    );
  }

  function selectChain(fields?: Row) {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit"]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (rows: Row[]) => unknown) =>
      Promise.resolve(
        project(dbHooks.selectResults.shift() ?? [], fields),
      ).then(resolve);
    return chain;
  }
  return {
    db: {
      select: selectChain,
      update: () => ({
        set: (values: Row) => ({
          where: (where: SQL) => {
            dbHooks.updates.push({ values, where });
            return {
              returning: async (fields?: Row) =>
                project(dbHooks.updateResults.shift() ?? [], fields),
            };
          },
        }),
      }),
      insert: () => ({
        values: (values: Row) => {
          dbHooks.inserts.push(values);
          return {
            returning: async (fields?: Row) =>
              project([{ id: "wh1", status: "active", ...values }], fields),
          };
        },
      }),
    },
  };
});

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({}),
}));

// The stored URL check is covered on its own; here it only gates the call.
vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

vi.mock("@/server/net/pinned-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof PinnedTransport>()),
  pinnedFetch: vi.fn(),
}));

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";
import {
  BlockedAddressError,
  pinnedFetch,
} from "@/server/net/pinned-transport";

const fetchMock = vi.mocked(pinnedFetch);
const validateMock = vi.mocked(validateWebhookUrl);

const storedWebhook = {
  id: "wh1",
  agentId: "agent1",
  ownerId: "user-1",
  url: "https://example.com/hook",
  secret: "s3cr3t",
  categories: ["inbox"],
  status: "active",
};

const input = { url: storedWebhook.url, categories: ["inbox" as const] };

function caller() {
  return createCaller({
    db: mockedDb,
    session: { user: { id: "user-1" } } as never,
    headers: new Headers(),
  } as never);
}

beforeEach(() => {
  dbHooks.selectResults = [[storedWebhook]];
  dbHooks.updateResults = [];
  dbHooks.updates = [];
  dbHooks.inserts = [];
  fetchMock.mockReset();
  validateMock.mockReset();
  validateMock.mockResolvedValue({ ok: true });
});

describe("agentManagement.getWebhook", () => {
  it.each(["pending", "active"])(
    "returns %s webhook metadata without the signing secret",
    async (status) => {
      dbHooks.selectResults = [[{ ...storedWebhook, status }]];

      const webhook = await caller().agentManagement.getWebhook();

      expect(webhook).toMatchObject({
        url: storedWebhook.url,
        categories: storedWebhook.categories,
        status,
        hasSecret: true,
      });
      expect(webhook).not.toHaveProperty("secret");
    },
  );

  it("returns null when there is no webhook", async () => {
    dbHooks.selectResults = [[]];

    await expect(caller().agentManagement.getWebhook()).resolves.toBeNull();
  });
});

describe("agentManagement.upsertWebhook", () => {
  it("returns the newly stored secret only at the top level of creation", async () => {
    dbHooks.selectResults = [[{ id: "agent1" }], []];

    const result = await caller().agentManagement.upsertWebhook(input);

    expect(result).toMatchObject({
      webhook: { url: input.url, status: "active", hasSecret: true },
      secretGenerated: true,
      secret: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.webhook).not.toHaveProperty("secret");
    expect(dbHooks.inserts).toEqual([
      expect.objectContaining({ secret: result.secret }),
    ]);
  });

  it("returns metadata and preserves the existing secret on a settings update", async () => {
    dbHooks.selectResults = [[{ id: "agent1" }], [storedWebhook]];
    dbHooks.updateResults = [[storedWebhook]];

    const result = await caller().agentManagement.upsertWebhook(input);

    expect(result).toMatchObject({
      webhook: { url: input.url, hasSecret: true },
      secretGenerated: false,
    });
    expect(result).not.toHaveProperty("secret");
    expect(result.webhook).not.toHaveProperty("secret");
    expect(dbHooks.updates[0]?.values).not.toHaveProperty("secret");
  });
});

describe("agentManagement.approveWebhook", () => {
  it("returns the secret only to the request that activates the pending webhook", async () => {
    const pending = { ...storedWebhook, status: "pending" };
    dbHooks.selectResults = [[pending], [pending]];
    dbHooks.updateResults = [[storedWebhook], []];
    const { approveWebhook } = caller().agentManagement;

    const results = await Promise.allSettled([
      approveWebhook(),
      approveWebhook(),
    ]);

    expect(results).toContainEqual({
      status: "fulfilled",
      value: { secret: storedWebhook.secret },
    });
    expect(results).toContainEqual({
      status: "rejected",
      reason: expect.objectContaining({ code: "CONFLICT" }),
    });
    expect(dbHooks.updates).toHaveLength(2);
    for (const { values, where } of dbHooks.updates) {
      expect(values).toMatchObject({ status: "active", isEnabled: true });
      const query = new PgDialect().sqlToQuery(where);
      expect(query.sql).toMatch(/"status" = \$\d+/);
      expect(query.params).toContain("pending");
    }
  });
});

describe("agentManagement.testWebhook", () => {
  it("POSTs a signed test event through the pinned transport and resets failures on 2xx", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }) as never);

    await expect(caller().agentManagement.testWebhook()).resolves.toEqual({
      success: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    expect(init!.method).toBe("POST");
    const body = init!.body as string;
    expect(JSON.parse(body)).toMatchObject({
      type: "test",
      data: { message: "Webhook connected successfully!" },
    });
    const headers = init!.headers as Record<string, string>;
    const expectedSig = createHmac("sha256", "s3cr3t")
      .update(body)
      .digest("hex");
    expect(headers["X-AIT-Signature"]).toBe(`sha256=${expectedSig}`);
    expect(headers["X-AIT-Event"]).toBe("test");
    expect(dbHooks.updates.map(({ values }) => values)).toEqual([
      { consecutiveFailures: 0, isEnabled: true },
    ]);
  });

  it("fails a redirect without following it", async () => {
    const redirect = new Response("moved", {
      status: 302,
      headers: { location: "https://10.0.0.1/" },
    });
    const cancel = vi.spyOn(redirect.body!, "cancel");
    fetchMock.mockResolvedValue(redirect as never);

    await expect(caller().agentManagement.testWebhook()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Webhook test failed: redirects are not followed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dbHooks.updates).toEqual([]);
  });

  it("reports a connect-time address refusal as a private/internal address", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new BlockedAddressError("example.com"),
      }),
    );

    await expect(caller().agentManagement.testWebhook()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Webhook URL resolves to a private/internal address",
    });
    expect(dbHooks.updates).toEqual([]);
  });

  it("reports any other network failure as before", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") }),
    );

    await expect(caller().agentManagement.testWebhook()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Webhook test failed: TypeError: fetch failed",
    });
    expect(dbHooks.updates).toEqual([]);
  });

  it("reports a non-2xx response with its status text", async () => {
    const failed = new Response("boom", {
      status: 500,
      statusText: "Internal Server Error",
    });
    const cancel = vi.spyOn(failed.body!, "cancel");
    fetchMock.mockResolvedValue(failed as never);

    await expect(caller().agentManagement.testWebhook()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Webhook test failed: Internal Server Error",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dbHooks.updates).toEqual([]);
  });

  it("never sends when the stored URL fails the address check", async () => {
    validateMock.mockResolvedValue({
      ok: false,
      reason: "Webhook URL must not point to localhost",
    });

    await expect(caller().agentManagement.testWebhook()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Webhook URL must not point to localhost",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
