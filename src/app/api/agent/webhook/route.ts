import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRateLimit } from "@/server/agent/rate-limit";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { agentWebhooks } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
] as const;

// ── Auth helper ─────────────────────────────────────────────────────────────

async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(db, apiKey);
  if (!keyData) return null;

  const rateLimit = checkRateLimit(keyData.agentId);
  if (!rateLimit.allowed) return null;

  return keyData;
}

// ── GET — check if webhook exists ───────────────────────────────────────────

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [webhook] = await db
    .select({
      url: agentWebhooks.url,
      categories: agentWebhooks.categories,
      isEnabled: agentWebhooks.isEnabled,
      consecutiveFailures: agentWebhooks.consecutiveFailures,
    })
    .from(agentWebhooks)
    .where(eq(agentWebhooks.agentId, auth.agentId))
    .limit(1);

  if (!webhook) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({ exists: true, webhook });
}

// ── PUT — register or update webhook ────────────────────────────────────────

export async function PUT(req: Request) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    url?: string;
    categories?: string[];
    secret?: string;
  };

  if (!body.url?.startsWith("https://")) {
    return NextResponse.json(
      { error: "Webhook URL must use HTTPS" },
      { status: 400 },
    );
  }

  // SSRF protection: block private/internal URLs
  const urlCheck = validateWebhookUrl(body.url);
  if (!urlCheck.ok) {
    return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
  }

  const categories = (body.categories ?? []).filter((c): c is string =>
    CATEGORIES.includes(c as (typeof CATEGORIES)[number]),
  );

  if (categories.length === 0) {
    return NextResponse.json(
      { error: "Select at least one event category" },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: agentWebhooks.id })
    .from(agentWebhooks)
    .where(eq(agentWebhooks.agentId, auth.agentId))
    .limit(1);

  if (existing) {
    const updates: Record<string, unknown> = {
      url: body.url,
      categories,
      consecutiveFailures: 0,
      isEnabled: true,
    };

    // Allow updating the secret if provided
    if (body.secret) {
      updates.secret = body.secret;
    }

    await db
      .update(agentWebhooks)
      .set(updates)
      .where(eq(agentWebhooks.id, existing.id));

    return NextResponse.json({ registered: true });
  }

  // New webhook — use provided secret or generate one
  const secret = body.secret ?? randomBytes(32).toString("hex");

  if (!auth.ownerId) {
    return NextResponse.json(
      { error: "Webhook registration requires a claimed agent with an owner" },
      { status: 403 },
    );
  }

  await db.insert(agentWebhooks).values({
    agentId: auth.agentId,
    ownerId: auth.ownerId,
    url: body.url,
    secret,
    categories,
  });

  return NextResponse.json({ registered: true, secret });
}

// ── DELETE — unregister webhook ─────────────────────────────────────────────

export async function DELETE(req: Request) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(agentWebhooks)
    .where(eq(agentWebhooks.agentId, auth.agentId));

  return NextResponse.json({ deleted: true });
}
