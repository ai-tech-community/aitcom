/**
 * DB-INTEGRATION test for the collaborative work-grid flow (ADR-0022/0023).
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * A plain `pnpm test` / `pnpm exec vitest run` SKIPS every test here and NEVER
 * opens a database connection (the gate is evaluated before any `db` import or
 * `beforeAll`, so nothing connects). It only runs when BOTH hold:
 *
 *   1. RUN_DB_TESTS === "1"  (explicit human opt-in), AND
 *   2. a LOCAL-looking database is configured — either NEON_LOCAL_PROXY is set
 *      (the Dockerised wsproxy, see src/server/db/index.ts), or DATABASE_URL
 *      points at a local host (localhost / 127.0.0.1 / a Docker service name
 *      like `db`/`postgres`). A cloud Neon host (*.neon.tech, *.aws.neon.tech)
 *      is explicitly rejected so this can never touch the production DB.
 *
 * Enable it (once Docker Postgres + wsproxy are up — see the repo's docker
 * compose dev stack) with:
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/work-grid.integration.test.ts
 *
 * (NEON_LOCAL_PROXY / DATABASE_URL come from your local .env; the dev stack sets
 * them to the local Postgres reached through the wsproxy container.)
 *
 * What it exercises against the REAL local DB, end to end:
 *   - create a commission (task-type allowlist) for the owner's agent,
 *   - create a collaborative work-grid + cells derived from a challenge's
 *     objectives,
 *   - the agent claims a cell, then submits a result,
 *   - the owner verifies the result and we assert:
 *       • verification-gated XP is awarded to the OWNER (not the agent),
 *       • the activity event is tagged metadata.isCommissioned === true, and
 *       • that action is EXCLUDED from the activation / contribution signal.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

// ── Opt-in gate (pure, no db import) ────────────────────────────────────────

/** A Neon CLOUD host must never be hit by this suite. */
function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

/** True only for a local-looking Postgres host. */
function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

/**
 * The single source of truth for "should this suite run?". Evaluated at module
 * load BEFORE any db connection is created, so a skipped run never connects.
 */
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;

  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";

  // A cloud DATABASE_URL is a hard stop even if a proxy is set — refuse to risk
  // the production Neon DB.
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;

  // Local wsproxy present (Dockerised dev) ⇒ local. Otherwise require a
  // local-looking DATABASE_URL.
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

// ── The integration suite (skipped wholesale unless opted in) ───────────────

describe.skipIf(!RUN_DB)("work-grid collaborative flow [DB integration]", () => {
  // Lazily-resolved modules — only imported INSIDE the suite so a skipped run
  // pulls in neither the db client nor the tRPC graph.
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    generateApiKey: typeof import("@/server/agent/api-key").generateApiKey;
    MANIFEST_VERSION: number;
    COMMISSIONED_VERIFICATION_WEIGHT: Record<string, number>;
    CONTRIBUTION_ACTIONS: readonly string[];
    eq: typeof import("drizzle-orm").eq;
    and: typeof import("drizzle-orm").and;
  };
  let m: Mods;

  beforeAll(async () => {
    const [
      { db },
      schema,
      { createCaller },
      { generateApiKey },
      { MANIFEST_VERSION },
      { COMMISSIONED_VERIFICATION_WEIGHT },
      { CONTRIBUTION_ACTIONS },
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/agent/api-key"),
      import("@/server/agent/manifest"),
      import("@/server/agent/commissioned-cell-xp"),
      import("@/server/communities/insights"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      generateApiKey,
      MANIFEST_VERSION,
      COMMISSIONED_VERIFICATION_WEIGHT,
      CONTRIBUTION_ACTIONS,
      eq: drizzle.eq,
      and: drizzle.and,
    };

    // Fail loudly if a cloud URL somehow slipped through the gate.
    const url = process.env.DATABASE_URL ?? "";
    if (looksLikeCloudNeon(url)) {
      throw new Error(
        "Refusing to run DB integration tests against a cloud Neon DATABASE_URL.",
      );
    }
  });

  // ── Per-test fixture: a unique owner + agent + community, torn down after ──

  type Fixture = {
    ownerId: string;
    agentId: string;
    apiKeyRaw: string;
    apiKeyId: string;
    communityId: string;
    /** task type modelling a challenge objective ("solve a code cell"). */
    taskType: string;
    suffix: string;
  };
  let fx: Fixture;

  /** Build an owner-session tRPC caller (protected procedures). */
  function ownerCaller(ownerId: string) {
    return m.createCaller({
      db: m.db,
      session: {
        // Minimal shape protectedProcedure needs: ctx.session.user.id.
        user: { id: ownerId },
      } as never,
      headers: new Headers(),
    });
  }

  /** Build an agent caller authenticated by the real API-key middleware. */
  function agentCaller(apiKeyRaw: string) {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${apiKeyRaw}`);
    return m.createCaller({
      db: m.db,
      session: null,
      headers,
    });
  }

  beforeEach(async () => {
    const { db, schema, generateApiKey, MANIFEST_VERSION } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `it-owner-${suffix}`;
    const agentId = `it-agent-${suffix}`;
    const communityId = `it-comm-${suffix}`;
    const taskType = "solve-code-cell";

    // Owner user + member profile (awardXp is a no-op without a member profile).
    await db.insert(schema.user).values({
      id: ownerId,
      email: `it-owner-${suffix}@example.test`,
      name: "Integration Owner",
    });
    await db.insert(schema.memberProfiles).values({
      userId: ownerId,
      displayName: "Integration Owner",
      xp: 0,
      level: 1,
    });

    // The owner's single agent + an API key carrying the commission scopes.
    await db.insert(schema.agentProfiles).values({
      id: agentId,
      ownerId,
      name: "Integration Agent",
      status: "active",
    });
    const { raw, hash, prefix } = generateApiKey();
    const [key] = await db
      .insert(schema.agentApiKeys)
      .values({
        agentId,
        ownerId,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: [
          "read",
          "self-profile",
          "commission:claim-cell",
          "commission:submit-result",
        ],
        isActive: true,
      })
      .returning({ id: schema.agentApiKeys.id });

    // Owner accepted the CURRENT manifest — without this, filterScopesByManifest
    // strips every `commission:*` scope and the agent gets read-only.
    await db.insert(schema.agentManifestAcceptances).values({
      ownerId,
      agentId,
      manifestVersion: MANIFEST_VERSION,
    });

    // A community the owner administers (community-scoped grid avoids Payload).
    await db.insert(schema.communities).values({
      id: communityId,
      name: `Integration Community ${suffix}`,
      slug: `it-comm-${suffix}`,
      createdBy: ownerId,
    });
    await db.insert(schema.communityMemberships).values({
      communityId,
      userId: ownerId,
      role: "owner",
      status: "active",
    });

    fx = {
      ownerId,
      agentId,
      apiKeyRaw: raw,
      apiKeyId: key!.id,
      communityId,
      taskType,
      suffix,
    };
  });

  afterEach(async () => {
    if (!fx) return;
    const { db, schema, eq } = m;
    // Tear down in FK-safe order. Cells/results/grids are looked up via the
    // community-scoped grid; activity events + commissions + agent rows by id.
    const grids = await db
      .select({ id: schema.workGrids.id })
      .from(schema.workGrids)
      .where(eq(schema.workGrids.communityId, fx.communityId));
    for (const g of grids) {
      const cells = await db
        .select({ id: schema.workCells.id })
        .from(schema.workCells)
        .where(eq(schema.workCells.gridId, g.id));
      for (const c of cells) {
        await db
          .delete(schema.workCellResults)
          .where(eq(schema.workCellResults.cellId, c.id));
      }
      await db
        .delete(schema.workCells)
        .where(eq(schema.workCells.gridId, g.id));
      await db.delete(schema.workGrids).where(eq(schema.workGrids.id, g.id));
    }

    await db
      .delete(schema.activityEvents)
      .where(eq(schema.activityEvents.actorId, fx.ownerId));
    await db
      .delete(schema.agentCommissions)
      .where(eq(schema.agentCommissions.ownerId, fx.ownerId));
    await db
      .delete(schema.agentManifestAcceptances)
      .where(eq(schema.agentManifestAcceptances.ownerId, fx.ownerId));
    await db
      .delete(schema.agentApiKeys)
      .where(eq(schema.agentApiKeys.agentId, fx.agentId));
    await db
      .delete(schema.communityMemberships)
      .where(eq(schema.communityMemberships.communityId, fx.communityId));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, fx.communityId));
    await db
      .delete(schema.agentProfiles)
      .where(eq(schema.agentProfiles.id, fx.agentId));
    await db
      .delete(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, fx.ownerId));
    await db.delete(schema.user).where(eq(schema.user.id, fx.ownerId));
  });

  it("verified commissioned cell awards verification-gated XP to the OWNER and tags the event isCommissioned + out of the activation signal", async () => {
    const { db, schema, eq, and, COMMISSIONED_VERIFICATION_WEIGHT, CONTRIBUTION_ACTIONS } =
      m;
    const owner = ownerCaller(fx.ownerId);
    const agent = agentCaller(fx.apiKeyRaw);

    // 1. Commission: a scoped, non-empty task-type allowlist for the owner's
    //    own agent. `solve-code-cell` is in the allowlist.
    const commission = await owner.commissions.grant({
      taskTypeAllowlist: [fx.taskType, "polish-text"],
      sourceScope: "enrolled-challenges",
    });
    expect(commission.ownerId).toBe(fx.ownerId);
    expect(commission.agentId).toBe(fx.agentId);
    expect(commission.taskTypeAllowlist).toContain(fx.taskType);

    // 2. Collaborative grid + cells "from a challenge" — one cell per objective.
    //    `consensus` verification ⇒ full-weight XP when verified.
    const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
      communityId: fx.communityId,
      cells: [
        { taskType: fx.taskType, verificationMode: "consensus" },
        { taskType: fx.taskType, verificationMode: "consensus" },
      ],
    });
    expect(cellIds).toHaveLength(2);

    const targetCellId = cellIds[0]!;

    // 3. The agent sees the cell in its claim queue (inside the envelope) and
    //    claims it atomically.
    const claimable = await agent.workGrid.listClaimable({ gridId });
    expect(claimable.map((c) => c.id)).toContain(targetCellId);

    const claimed = await agent.workGrid.claimCell({ cellId: targetCellId });
    expect(claimed.status).toBe("claimed");
    expect(claimed.claimedBy).toBe(fx.agentId);

    // 4. Outbound result return (no webhook). Cell ⇒ completed, result pending.
    const submitted = await agent.workGrid.submitCellResult({
      cellId: targetCellId,
      output: "def solve(): return 42",
    });
    expect(submitted.status).toBe("completed");

    // XP must NOT yet be awarded — verification is the gate, not submission.
    const [beforeVerify] = await db
      .select({ xp: schema.memberProfiles.xp })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, fx.ownerId));
    expect(beforeVerify!.xp).toBe(0);

    // 5. Owner verifies the result ⇒ owner earns, scaled by verificationMode.
    const verifyRes = await owner.workGrid.verifyCellResult({
      cellId: targetCellId,
      outcome: "verified",
    });
    const expectedXp = Math.round(
      50 * COMMISSIONED_VERIFICATION_WEIGHT.consensus!,
    );
    expect(verifyRes.outcome).toBe("verified");
    expect(verifyRes.xpAwarded).toBe(expectedXp);

    // XP accrued to the OWNER's member profile, not the agent.
    const [afterVerify] = await db
      .select({ xp: schema.memberProfiles.xp })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, fx.ownerId));
    expect(afterVerify!.xp).toBe(expectedXp);

    // 6. The activity event is tagged isCommissioned, attributes the OWNER as
    //    actor, and its action is excluded from the activation signal.
    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.actorId, fx.ownerId),
          eq(schema.activityEvents.action, "workcell.completed"),
        ),
      );
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.actorType).toBe("member");
    expect(event.actorId).toBe(fx.ownerId);
    expect(event.targetId).toBe(targetCellId);
    expect((event.metadata as Record<string, unknown>).isCommissioned).toBe(
      true,
    );
    expect((event.metadata as Record<string, unknown>).xp).toBe(expectedXp);

    // The commissioned completion is NOT an activation/contribution signal.
    expect(CONTRIBUTION_ACTIONS as readonly string[]).not.toContain(
      "workcell.completed",
    );
  });

  it("self-report verification pays only the small self-report fraction (verification is the gate, not the mode)", async () => {
    const { db, schema, eq, COMMISSIONED_VERIFICATION_WEIGHT } = m;
    const owner = ownerCaller(fx.ownerId);
    const agent = agentCaller(fx.apiKeyRaw);

    await owner.commissions.grant({
      taskTypeAllowlist: [fx.taskType],
      sourceScope: "enrolled-challenges",
    });

    const { cellIds } = await owner.workGrid.createCollaborativeGrid({
      communityId: fx.communityId,
      cells: [{ taskType: fx.taskType, verificationMode: "self-report" }],
    });
    const cellId = cellIds[0]!;

    await agent.workGrid.claimCell({ cellId });
    await agent.workGrid.submitCellResult({ cellId, output: "ok" });

    const verifyRes = await owner.workGrid.verifyCellResult({
      cellId,
      outcome: "verified",
    });
    const expectedXp = Math.round(
      50 * COMMISSIONED_VERIFICATION_WEIGHT["self-report"]!,
    );
    expect(verifyRes.xpAwarded).toBe(expectedXp);

    const [profile] = await db
      .select({ xp: schema.memberProfiles.xp })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, fx.ownerId));
    expect(profile!.xp).toBe(expectedXp);
  });

  it("a FAILED outcome pays no XP but still records the commissioned event", async () => {
    const { db, schema, eq, and } = m;
    const owner = ownerCaller(fx.ownerId);
    const agent = agentCaller(fx.apiKeyRaw);

    await owner.commissions.grant({
      taskTypeAllowlist: [fx.taskType],
      sourceScope: "enrolled-challenges",
    });
    const { cellIds } = await owner.workGrid.createCollaborativeGrid({
      communityId: fx.communityId,
      cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
    });
    const cellId = cellIds[0]!;

    await agent.workGrid.claimCell({ cellId });
    await agent.workGrid.submitCellResult({ cellId, output: "wrong" });

    const verifyRes = await owner.workGrid.verifyCellResult({
      cellId,
      outcome: "failed",
    });
    expect(verifyRes.xpAwarded).toBe(0);

    const [profile] = await db
      .select({ xp: schema.memberProfiles.xp })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, fx.ownerId));
    expect(profile!.xp).toBe(0);

    // The cell is marked failed and the commissioned event is still logged.
    const [cell] = await db
      .select({ status: schema.workCells.status })
      .from(schema.workCells)
      .where(eq(schema.workCells.id, cellId));
    expect(cell!.status).toBe("failed");

    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.actorId, fx.ownerId),
          eq(schema.activityEvents.action, "workcell.completed"),
        ),
      );
    expect(events).toHaveLength(1);
    expect(
      (events[0]!.metadata as Record<string, unknown>).isCommissioned,
    ).toBe(true);
  });

  it("a cell whose task type is OUTSIDE the commission allowlist is never claimable", async () => {
    const owner = ownerCaller(fx.ownerId);
    const agent = agentCaller(fx.apiKeyRaw);

    // Commission allows only `polish-text`; the grid's cells are `solve-code-cell`.
    await owner.commissions.grant({
      taskTypeAllowlist: ["polish-text"],
      sourceScope: "enrolled-challenges",
    });
    const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
      communityId: fx.communityId,
      cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
    });

    // Out-of-envelope cells are filtered out before the agent ever sees them.
    const claimable = await agent.workGrid.listClaimable({ gridId });
    expect(claimable.map((c) => c.id)).not.toContain(cellIds[0]);

    // And a direct claim is rejected by the allowlist gate.
    await expect(
      agent.workGrid.claimCell({ cellId: cellIds[0]! }),
    ).rejects.toThrow(/allowlist/i);
  });
});
