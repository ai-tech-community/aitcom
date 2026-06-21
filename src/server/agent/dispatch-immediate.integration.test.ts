import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

// Mock the SSRF check so tests don't depend on DNS for example.com.
vi.mock("./validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Opt-in gate (pure, no db import) ────────────────────────────────────────
function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("dispatchEventImmediately [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    dispatchEventImmediately: typeof import("./dispatch-immediate").dispatchEventImmediately;
  };
  let m: Mods;

  beforeAll(async () => {
    const [{ db }, schema, { dispatchEventImmediately }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./dispatch-immediate"),
    ]);
    m = { db, schema, dispatchEventImmediately };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run DB integration tests against cloud Neon.");
    }
  });

  type Fixture = { ownerId: string; agentId: string; secret: string };
  let fx: Fixture;

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `it-owner-${suffix}`;
    const agentId = `it-agent-${suffix}`;
    const secret = "test-secret-abc";

    await db.insert(schema.user).values({
      id: ownerId,
      email: `it-${suffix}@example.test`,
      name: "IT Owner",
    });
    await db.insert(schema.memberProfiles).values({
      userId: ownerId,
      displayName: "IT Owner",
      xp: 0,
      level: 1,
    });
    await db.insert(schema.agentProfiles).values({
      id: agentId,
      ownerId,
      name: "IT Agent",
      status: "active",
    });
    await db.insert(schema.agentWebhooks).values({
      agentId,
      ownerId,
      url: "https://example.com/hook",
      secret,
      categories: ["inbox"],
      cursor: null,
      isEnabled: true,
    });
    fx = { ownerId, agentId, secret };
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.agentWebhooks).where(eq(schema.agentWebhooks.ownerId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.recipientId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.actorId, fx.ownerId));
    await db.delete(schema.agentProfiles).where(eq(schema.agentProfiles.id, fx.agentId));
    await db.delete(schema.memberProfiles).where(eq(schema.memberProfiles.userId, fx.ownerId));
    await db.delete(schema.user).where(eq(schema.user.id, fx.ownerId));
    vi.restoreAllMocks();
  });

  async function insertMessageEvent(
    createdAt: Date,
    recipientId: string | null | undefined = undefined,
  ) {
    if (recipientId === undefined) {
      recipientId = fx.ownerId;
    }
    const { db, schema } = m;
    const [row] = await db
      .insert(schema.activityEvents)
      .values({
        actorId: fx.ownerId,
        actorType: "member",
        action: "message.sent",
        targetType: "conversations",
        targetId: "conv-x",
        recipientId,
        createdAt,
      })
      .returning();
    return row!;
  }

  async function getCursor() {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    const [wh] = await db
      .select({ cursor: schema.agentWebhooks.cursor })
      .from(schema.agentWebhooks)
      .where(eq(schema.agentWebhooks.ownerId, fx.ownerId))
      .limit(1);
    return wh?.cursor ?? null;
  }

  it("POSTs a signed wake to a matching webhook and leaves the cursor to the cron", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const evt = await insertMessageEvent(new Date());
    await m.dispatchEventImmediately(m.db, evt);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    const body = init!.body as string;
    expect(JSON.parse(body)).toMatchObject({ eventId: evt.id, type: "message.sent" });
    const headers = init!.headers as Record<string, string>;
    const expectedSig = createHmac("sha256", fx.secret).update(body).digest("hex");
    expect(headers["X-AIT-Signature"]).toBe(`sha256=${expectedSig}`);

    // The immediate path never advances the cursor — the cron owns it.
    expect(await getCursor()).toBeNull();
  });

  it("does not deliver to a webhook whose owner isn't the recipient", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const evt = await insertMessageEvent(new Date(), "some-other-owner");
    await m.dispatchEventImmediately(m.db, evt);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { db, schema } = m;
    const [evt] = await db
      .insert(schema.activityEvents)
      .values({
        actorId: fx.ownerId,
        actorType: "member",
        action: "thread.created",
        recipientId: null,
        createdAt: new Date(),
      })
      .returning();

    await m.dispatchEventImmediately(m.db, evt!);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
