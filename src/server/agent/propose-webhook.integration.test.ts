import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

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

describe.skipIf(!RUN_DB)("propose-webhook [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    eq: typeof import("drizzle-orm").eq;
    and: typeof import("drizzle-orm").and;
  };
  let m: Mods;

  beforeAll(async () => {
    const [{ db }, schema, { eq, and }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
    ]);
    m = { db, schema, eq, and };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run DB integration tests against cloud Neon.");
    }
  });

  type Fixture = { ownerId: string; agentId: string };
  let fx: Fixture;

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `it-owner-${suffix}`;
    const agentId = `it-agent-${suffix}`;

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
    fx = { ownerId, agentId };
  });

  afterEach(async () => {
    const { db, schema, eq } = m;
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, fx.ownerId));
    await db.delete(schema.agentWebhooks).where(eq(schema.agentWebhooks.ownerId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.recipientId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.actorId, fx.agentId));
    await db.delete(schema.agentProfiles).where(eq(schema.agentProfiles.id, fx.agentId));
    await db.delete(schema.memberProfiles).where(eq(schema.memberProfiles.userId, fx.ownerId));
    await db.delete(schema.user).where(eq(schema.user.id, fx.ownerId));
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function proposeWebhook(
    url: string,
    categories: string[],
  ) {
    const { db, schema, eq } = m;
    const ownerId = fx.ownerId;
    const agentId = fx.agentId;

    const [existing] = await db
      .select()
      .from(schema.agentWebhooks)
      .where(eq(schema.agentWebhooks.ownerId, ownerId))
      .limit(1);

    // No-op if re-proposing the exact active config.
    if (
      existing &&
      existing.status === "active" &&
      existing.url === url &&
      JSON.stringify([...(existing.categories as string[])].sort()) ===
        JSON.stringify([...categories].sort())
    ) {
      return { status: "active" as const, webhookId: existing.id };
    }

    let webhookId: string;
    if (existing) {
      const [updated] = await db
        .update(schema.agentWebhooks)
        .set({
          url,
          categories: [...categories],
          status: "pending",
          isEnabled: false,
          consecutiveFailures: 0,
        })
        .where(eq(schema.agentWebhooks.id, existing.id))
        .returning({ id: schema.agentWebhooks.id });
      webhookId = updated!.id;
    } else {
      const secret = randomBytes(32).toString("hex");
      const [inserted] = await db
        .insert(schema.agentWebhooks)
        .values({
          agentId,
          ownerId,
          url,
          secret,
          categories: [...categories],
          status: "pending",
          isEnabled: false,
        })
        .returning({ id: schema.agentWebhooks.id });
      webhookId = inserted!.id;
    }

    await db.insert(schema.notifications).values({
      userId: ownerId,
      type: "webhook_proposed",
      title: "Your agent wants to receive events",
      content: `Your agent proposed a webhook at ${url}. Review and approve it to start realtime delivery.`,
      metadata: {
        reviewPath: "/dashboard/agent?tab=connect",
        linkLabel: "Review webhook request",
        webhookId,
      },
    });

    return { status: "pending" as const, webhookId };
  }

  async function getWebhookRow() {
    const { db, schema, eq } = m;
    const [row] = await db
      .select()
      .from(schema.agentWebhooks)
      .where(eq(schema.agentWebhooks.ownerId, fx.ownerId))
      .limit(1);
    return row ?? null;
  }

  async function getNotificationCount() {
    const { db, schema, eq } = m;
    const rows = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, fx.ownerId));
    return rows.length;
  }

  // ── Case 1 ───────────────────────────────────────────────────────────────
  it("first proposal inserts a pending row with a non-empty secret and notifies the owner", async () => {
    await proposeWebhook("https://example.com/hook", ["inbox"]);

    const row = await getWebhookRow();
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.isEnabled).toBe(false);
    expect(row!.secret).toBeTruthy();
    expect(row!.secret.length).toBeGreaterThan(0);
    expect(row!.url).toBe("https://example.com/hook");

    const notifCount = await getNotificationCount();
    expect(notifCount).toBe(1);
  });

  // ── Case 2 ───────────────────────────────────────────────────────────────
  it("a pending webhook is NOT returned by the active-only delivery query", async () => {
    const { db, schema, eq, and } = m;

    await proposeWebhook("https://example.com/hook", ["inbox"]);

    // Replicate the active-only selection used in webhook-dispatch.ts
    const rows = await db
      .select()
      .from(schema.agentWebhooks)
      .where(
        and(
          eq(schema.agentWebhooks.isEnabled, true),
          eq(schema.agentWebhooks.status, "active"),
        ),
      );

    const ourRow = rows.find((r) => r.ownerId === fx.ownerId);
    expect(ourRow).toBeUndefined();
  });

  // ── Case 3 ───────────────────────────────────────────────────────────────
  it("re-proposing a different URL over an active row flips to pending and preserves the secret", async () => {
    const { db, schema, eq } = m;

    // Seed an active webhook directly.
    const originalSecret = randomBytes(32).toString("hex");
    await db.insert(schema.agentWebhooks).values({
      agentId: fx.agentId,
      ownerId: fx.ownerId,
      url: "https://example.com/hook-v1",
      secret: originalSecret,
      categories: ["inbox"],
      status: "active",
      isEnabled: true,
    });

    // Re-propose with a different URL.
    await proposeWebhook("https://example.com/hook-v2", ["inbox"]);

    const row = await getWebhookRow();
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.isEnabled).toBe(false);
    expect(row!.url).toBe("https://example.com/hook-v2");
    // Secret must be preserved — the update path never generates a new one.
    expect(row!.secret).toBe(originalSecret);
  });

  // ── Case 4 ───────────────────────────────────────────────────────────────
  it("re-proposing the exact active url+categories is a no-op (stays active)", async () => {
    const { db, schema, eq } = m;

    // Seed an active webhook directly.
    const originalSecret = randomBytes(32).toString("hex");
    await db.insert(schema.agentWebhooks).values({
      agentId: fx.agentId,
      ownerId: fx.ownerId,
      url: "https://example.com/hook",
      secret: originalSecret,
      categories: ["inbox"],
      status: "active",
      isEnabled: true,
    });

    const result = await proposeWebhook("https://example.com/hook", ["inbox"]);
    expect(result.status).toBe("active");

    // Row must still be active.
    const row = await getWebhookRow();
    expect(row!.status).toBe("active");
    expect(row!.isEnabled).toBe(true);

    // No notification was sent for a no-op.
    const notifCount = await getNotificationCount();
    expect(notifCount).toBe(0);
  });
});
