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
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/api/routers/work-grid.integration.test.ts
 *
 * (SKIP_ENV_VALIDATION is needed because vitest's jsdom environment trips
 * the t3-env server-var guard; the DATABASE_URL/NEON_LOCAL_PROXY values
 * match the repo's docker compose dev stack.)
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

describe.skipIf(!RUN_DB)(
  "work-grid collaborative flow [DB integration]",
  () => {
    // Lazily-resolved modules — only imported INSIDE the suite so a skipped run
    // pulls in neither the db client nor the tRPC graph.
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      requeueExpiredCells: typeof import("@/server/api/routers/work-grid").requeueExpiredCells;
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
        { requeueExpiredCells },
        { generateApiKey },
        { MANIFEST_VERSION },
        { COMMISSIONED_VERIFICATION_WEIGHT },
        { CONTRIBUTION_ACTIONS },
        drizzle,
      ] = await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/api/routers/work-grid"),
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
        requeueExpiredCells,
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
      const {
        db,
        schema,
        eq,
        and,
        COMMISSIONED_VERIFICATION_WEIGHT,
        CONTRIBUTION_ACTIONS,
      } = m;
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
      expect(event.metadata!.isCommissioned).toBe(true);
      expect(event.metadata!.xp).toBe(expectedXp);

      // The commissioned completion is NOT an activation/contribution signal.
      expect(CONTRIBUTION_ACTIONS).not.toContain("workcell.completed");
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
      expect(events[0]!.metadata!.isCommissioned).toBe(true);
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

    // ── S2: only the grid owner/admin may verify ──────────────────────────────

    it("S2: a non-admin/non-sponsor caller to verifyCellResult is rejected FORBIDDEN and owner XP stays 0", async () => {
      const { db, schema, eq } = m;
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
      await agent.workGrid.submitCellResult({ cellId, output: "ok" });

      // A second, unrelated user who is NOT an owner/admin of this community.
      const strangerId = `it-stranger-${fx.suffix}`;
      await db.insert(schema.user).values({
        id: strangerId,
        email: `it-stranger-${fx.suffix}@example.test`,
        name: "Integration Stranger",
      });
      await db.insert(schema.memberProfiles).values({
        userId: strangerId,
        displayName: "Integration Stranger",
        xp: 0,
        level: 1,
      });

      try {
        const stranger = ownerCaller(strangerId);
        // The stranger cannot administer this community's grid → FORBIDDEN.
        await expect(
          stranger.workGrid.verifyCellResult({ cellId, outcome: "verified" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        // No verification happened, so the OWNER earned nothing.
        const [profile] = await db
          .select({ xp: schema.memberProfiles.xp })
          .from(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, fx.ownerId));
        expect(profile!.xp).toBe(0);

        // The result is still pending — the stranger could not flip it.
        const [result] = await db
          .select({ outcome: schema.workCellResults.verificationOutcome })
          .from(schema.workCellResults)
          .where(eq(schema.workCellResults.cellId, cellId));
        expect(result!.outcome).toBe("pending");
      } finally {
        await db
          .delete(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, strangerId));
        await db.delete(schema.user).where(eq(schema.user.id, strangerId));
      }
    });

    // ── S3: idempotency under double-claim / wrong-agent / double-verify ──────

    it("S3: double-claim → CONFLICT; wrong-agent submit → FORBIDDEN; double-verify → CONFLICT and XP is not double-minted", async () => {
      const { db, schema, eq, COMMISSIONED_VERIFICATION_WEIGHT } = m;
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

      // First claim wins.
      await agent.workGrid.claimCell({ cellId });
      // Second claim on the now-claimed cell → CONFLICT (atomic guard).
      await expect(agent.workGrid.claimCell({ cellId })).rejects.toMatchObject({
        code: "CONFLICT",
      });

      // A SECOND agent (different owner) cannot submit a result for a cell it
      // never claimed → FORBIDDEN/CONFLICT (the self-guarding UPDATE matches no
      // row claimed by this other agent).
      const otherOwnerId = `it-owner2-${fx.suffix}`;
      const otherAgentId = `it-agent2-${fx.suffix}`;
      await db.insert(schema.user).values({
        id: otherOwnerId,
        email: `it-owner2-${fx.suffix}@example.test`,
        name: "Integration Owner 2",
      });
      await db.insert(schema.memberProfiles).values({
        userId: otherOwnerId,
        displayName: "Integration Owner 2",
        xp: 0,
        level: 1,
      });
      await db.insert(schema.agentProfiles).values({
        id: otherAgentId,
        ownerId: otherOwnerId,
        name: "Integration Agent 2",
        status: "active",
      });
      // A real, hashed key for the other agent so the middleware accepts it.
      const otherKey = m.generateApiKey();
      await db.insert(schema.agentApiKeys).values({
        agentId: otherAgentId,
        ownerId: otherOwnerId,
        keyHash: otherKey.hash,
        keyPrefix: otherKey.prefix,
        scopes: [
          "read",
          "self-profile",
          "commission:claim-cell",
          "commission:submit-result",
        ],
        isActive: true,
      });
      await db.insert(schema.agentManifestAcceptances).values({
        ownerId: otherOwnerId,
        agentId: otherAgentId,
        manifestVersion: m.MANIFEST_VERSION,
      });

      try {
        const otherAgent = agentCaller(otherKey.raw);
        await expect(
          otherAgent.workGrid.submitCellResult({ cellId, output: "stolen" }),
        ).rejects.toMatchObject({ code: "CONFLICT" });

        // The rightful claimer submits its result (cell → completed).
        await agent.workGrid.submitCellResult({ cellId, output: "ok" });

        // First verify earns the owner XP.
        const verify1 = await owner.workGrid.verifyCellResult({
          cellId,
          outcome: "verified",
        });
        const expectedXp = Math.round(
          50 * COMMISSIONED_VERIFICATION_WEIGHT.consensus!,
        );
        expect(verify1.xpAwarded).toBe(expectedXp);

        // Second verify of the SAME cell → CONFLICT (no pending result left).
        await expect(
          owner.workGrid.verifyCellResult({ cellId, outcome: "verified" }),
        ).rejects.toMatchObject({ code: "CONFLICT" });

        // XP was minted exactly once, not doubled.
        const [profile] = await db
          .select({ xp: schema.memberProfiles.xp })
          .from(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, fx.ownerId));
        expect(profile!.xp).toBe(expectedXp);
      } finally {
        await db
          .delete(schema.agentManifestAcceptances)
          .where(eq(schema.agentManifestAcceptances.ownerId, otherOwnerId));
        await db
          .delete(schema.agentApiKeys)
          .where(eq(schema.agentApiKeys.agentId, otherAgentId));
        await db
          .delete(schema.agentProfiles)
          .where(eq(schema.agentProfiles.id, otherAgentId));
        await db
          .delete(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, otherOwnerId));
        await db.delete(schema.user).where(eq(schema.user.id, otherOwnerId));
      }
    });

    // ── S1: source-scope — a not-enrolled challenge cell is invisible ─────────

    it("S1: a cell from a challenge the owner is NOT enrolled in is filtered from listClaimable and rejected by claimCell", async () => {
      const { db, schema, eq } = m;
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      // A challenge-scoped grid inserted directly (sidesteps Payload authz; the
      // claim/list paths read enrollment, not Payload). The owner holds NO
      // enrollment in this challenge, so the cell is out of source scope.
      const challengeId = 999_000_000 + (Date.now() % 1_000_000);
      const [grid] = await db
        .insert(schema.workGrids)
        .values({ mode: "collaborative", status: "active", challengeId })
        .returning({ id: schema.workGrids.id });
      const [cell] = await db
        .insert(schema.workCells)
        .values({
          gridId: grid!.id,
          taskType: fx.taskType,
          verificationMode: "consensus",
          status: "pending",
        })
        .returning({ id: schema.workCells.id });

      try {
        // Out of source scope ⇒ filtered from the claim queue.
        const claimable = await agent.workGrid.listClaimable({
          gridId: grid!.id,
        });
        expect(claimable.map((c) => c.id)).not.toContain(cell!.id);

        // And a direct claim is rejected by the source-scope gate.
        await expect(
          agent.workGrid.claimCell({ cellId: cell!.id }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        // Enrolling the owner brings the same cell into scope (proves the gate is
        // enrollment, not a blanket challenge block).
        await db.insert(schema.challengeEnrollments).values({
          challengeId,
          userId: fx.ownerId,
          status: "active",
        });
        const claimableNow = await agent.workGrid.listClaimable({
          gridId: grid!.id,
        });
        expect(claimableNow.map((c) => c.id)).toContain(cell!.id);
      } finally {
        await db
          .delete(schema.challengeEnrollments)
          .where(eq(schema.challengeEnrollments.challengeId, challengeId));
        await db
          .delete(schema.workCells)
          .where(eq(schema.workCells.gridId, grid!.id));
        await db
          .delete(schema.workGrids)
          .where(eq(schema.workGrids.id, grid!.id));
      }
    });

    // ── revoke → deny: an instantly-revoked commission closes the channel ─────

    it("revoke → deny: after commissions.revoke, listClaimable is empty and claimCell is FORBIDDEN", async () => {
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      const commission = await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });
      const cellId = cellIds[0]!;

      // Before revocation the cell is claimable.
      const before = await agent.workGrid.listClaimable({ gridId });
      expect(before.map((c) => c.id)).toContain(cellId);

      // Revoke instantly closes the channel (ADR-0022).
      await owner.commissions.revoke({ commissionId: commission.id });

      // The claim queue is now empty (no active commission) …
      const after = await agent.workGrid.listClaimable({ gridId });
      expect(after).toHaveLength(0);

      // … and a direct claim is FORBIDDEN (no active commission).
      await expect(agent.workGrid.claimCell({ cellId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    // ── manifest-strip: no/stale acceptance strips the commission scope ───────

    it("manifest-strip: without the current acceptance row, commission scope is stripped → claimCell and listClaimable are denied", async () => {
      const { db, schema, eq } = m;
      const owner = ownerCaller(fx.ownerId);

      await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });
      const cellId = cellIds[0]!;

      // Strip the owner's acceptance of the CURRENT manifest version — the same
      // effect as a MANIFEST_VERSION bump the owner has not re-accepted. The
      // scope filter removes every `commission:*` scope, leaving read-only.
      await db
        .delete(schema.agentManifestAcceptances)
        .where(eq(schema.agentManifestAcceptances.ownerId, fx.ownerId));

      const agent = agentCaller(fx.apiKeyRaw);

      // commission:claim-cell is stripped ⇒ requireScope rejects FORBIDDEN.
      await expect(
        agent.workGrid.listClaimable({ gridId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(agent.workGrid.claimCell({ cellId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    // ── SEC-1: community source-scope — owner must be a community member ───────

    it("SEC-1: a community-scoped cell is excluded from listClaimable and rejected by claimCell while the owner is NOT a member, and becomes claimable once membership is added", async () => {
      const { db, schema, eq, and } = m;
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });
      const cellId = cellIds[0]!;

      // Remove the owner's membership (the fixture seeds an active owner row) so
      // the owner is NOT a member of the grid's community. The source-scope
      // firebreak must then hide the cell, even though the grid was created while
      // the owner was still an admin.
      await db
        .delete(schema.communityMemberships)
        .where(
          and(
            eq(schema.communityMemberships.communityId, fx.communityId),
            eq(schema.communityMemberships.userId, fx.ownerId),
          ),
        );

      // Out of community source scope ⇒ filtered from the claim queue …
      const claimable = await agent.workGrid.listClaimable({ gridId });
      expect(claimable.map((c) => c.id)).not.toContain(cellId);

      // … and a direct claim is FORBIDDEN.
      await expect(agent.workGrid.claimCell({ cellId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      // Restoring an active membership brings the same cell into scope (proves the
      // gate is membership, not a blanket community block).
      await db.insert(schema.communityMemberships).values({
        communityId: fx.communityId,
        userId: fx.ownerId,
        role: "owner",
        status: "active",
      });
      const claimableNow = await agent.workGrid.listClaimable({ gridId });
      expect(claimableNow.map((c) => c.id)).toContain(cellId);

      const claimed = await agent.workGrid.claimCell({ cellId });
      expect(claimed.status).toBe("claimed");
      expect(claimed.claimedBy).toBe(fx.agentId);
    });

    // ── SEC-2: a revoked commission closes the SUBMIT path too ────────────────

    it("SEC-2: after a claim, revoking the commission makes submitCellResult throw (no active commission → FORBIDDEN)", async () => {
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      const commission = await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      const { cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });
      const cellId = cellIds[0]!;

      // The agent legitimately claims the cell while the commission is live.
      const claimed = await agent.workGrid.claimCell({ cellId });
      expect(claimed.status).toBe("claimed");

      // The owner revokes the commission (ADR-0022: revoke instantly closes the
      // channel) AFTER the claim but BEFORE the result is returned.
      await owner.commissions.revoke({ commissionId: commission.id });

      // submitCellResult must reject — the live consent gate is gone, so a
      // revoked agent can no longer return a result for its already-claimed cell.
      await expect(
        agent.workGrid.submitCellResult({ cellId, output: "too late" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    // ── T1: getGrid is admin-only — a stranger cannot read another grid ───────

    it("T1: a non-admin stranger calling getGrid is rejected FORBIDDEN while the grid admin can read it", async () => {
      const { db, schema } = m;
      const owner = ownerCaller(fx.ownerId);

      const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });

      // The grid admin (community config-admin) can read the grid + its cells.
      const adminView = await owner.workGrid.getGrid({ gridId });
      expect(adminView.grid.id).toBe(gridId);
      expect(adminView.cells.map((c) => c.id)).toEqual(
        expect.arrayContaining(cellIds),
      );

      // A second, unrelated logged-in user who is NOT an admin of this community.
      const strangerId = `it-stranger-${fx.suffix}`;
      await db.insert(schema.user).values({
        id: strangerId,
        email: `it-stranger-${fx.suffix}@example.test`,
        name: "Integration Stranger",
      });

      try {
        const stranger = ownerCaller(strangerId);
        await expect(
          stranger.workGrid.getGrid({ gridId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await db.delete(schema.user).where(m.eq(schema.user.id, strangerId));
      }
    });

    // ── CR-1: deadline → requeue self-heal (anti-livelock) ────────────────────

    it("CR-1/requeue: an expired claimed cell is requeued (status requeued, claimedBy/deadline cleared) while a future-window cell is left alone; a non-Hub-operator caller to requeueExpired is rejected", async () => {
      const { db, schema, eq } = m;
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      // Two cells: one with a tiny deadline (expires almost immediately on claim)
      // and one with a long deadline (its window stays open).
      const { cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [
          {
            taskType: fx.taskType,
            verificationMode: "consensus",
            deadlineMinutes: 1,
          },
          {
            taskType: fx.taskType,
            verificationMode: "consensus",
            deadlineMinutes: 60,
          },
        ],
      });
      const expiringCellId = cellIds[0]!;
      const freshCellId = cellIds[1]!;

      // Claim both — each arms a fresh deadline (now + deadlineMinutes).
      await agent.workGrid.claimCell({ cellId: expiringCellId });
      await agent.workGrid.claimCell({ cellId: freshCellId });

      // Force the first cell's deadline into the past (simulates the 1-minute
      // window elapsing) without waiting on wall-clock time. The second cell keeps
      // its future deadline.
      await db
        .update(schema.workCells)
        .set({ deadline: new Date(Date.now() - 60_000) })
        .where(eq(schema.workCells.id, expiringCellId));

      // The shared requeue driver self-heals the expired cell only.
      const requeued = await m.requeueExpiredCells(db);
      expect(requeued.map((c) => c.id)).toContain(expiringCellId);
      expect(requeued.map((c) => c.id)).not.toContain(freshCellId);

      // Expired cell: status requeued, claimer + deadline cleared (anti-livelock).
      const [expired] = await db
        .select({
          status: schema.workCells.status,
          claimedBy: schema.workCells.claimedBy,
          deadline: schema.workCells.deadline,
        })
        .from(schema.workCells)
        .where(eq(schema.workCells.id, expiringCellId));
      expect(expired!.status).toBe("requeued");
      expect(expired!.claimedBy).toBeNull();
      expect(expired!.deadline).toBeNull();

      // Future-window cell: untouched, still claimed by this agent.
      const [fresh] = await db
        .select({
          status: schema.workCells.status,
          claimedBy: schema.workCells.claimedBy,
        })
        .from(schema.workCells)
        .where(eq(schema.workCells.id, freshCellId));
      expect(fresh!.status).toBe("claimed");
      expect(fresh!.claimedBy).toBe(fx.agentId);

      // The requeued cell drops back into the agent's claim queue (re-claimable).
      const claimableAfter = await agent.workGrid.listClaimable({
        gridId: requeued[0]!.gridId,
      });
      expect(claimableAfter.map((c) => c.id)).toContain(expiringCellId);

      // requeueExpired (the tRPC procedure) is Hub-operator only: the fixture owner
      // is an owner of their OWN community, never of the root Hub, so calling it is
      // FORBIDDEN. This keeps any logged-in agent owner from requeuing the platform.
      await expect(owner.workGrid.requeueExpired()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    // ── grid-status: a cell in a non-active (completed/abandoned) grid is not
    // claimable, even by cellId (claimCell must agree with listClaimable) ────────

    it("a cell in a non-active (completed) grid is not claimable: it is filtered from listClaimable and claimCell throws CONFLICT", async () => {
      const { db, schema, eq } = m;
      const owner = ownerCaller(fx.ownerId);
      const agent = agentCaller(fx.apiKeyRaw);

      await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      const { gridId, cellIds } = await owner.workGrid.createCollaborativeGrid({
        communityId: fx.communityId,
        cells: [{ taskType: fx.taskType, verificationMode: "consensus" }],
      });
      const cellId = cellIds[0]!;

      // While active the cell is claimable.
      const before = await agent.workGrid.listClaimable({ gridId });
      expect(before.map((c) => c.id)).toContain(cellId);

      // Complete the grid: the pull queue must stop dispatching its cells.
      await db
        .update(schema.workGrids)
        .set({ status: "completed" })
        .where(eq(schema.workGrids.id, gridId));

      // Filtered from the claim queue …
      const after = await agent.workGrid.listClaimable({ gridId });
      expect(after.map((c) => c.id)).not.toContain(cellId);

      // … and a direct claim by cellId is rejected (grid no longer active).
      await expect(agent.workGrid.claimCell({ cellId })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    // ── re-grant UPSERT: a second grant re-scopes the envelope AND un-revokes ───

    it("commissions.grant re-grant updates the stored allowlist and clears revokedAt (UPSERT, not a silent no-op)", async () => {
      const { db, schema, eq } = m;
      const owner = ownerCaller(fx.ownerId);

      // Initial grant, then revoke to set revokedAt.
      const first = await owner.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });
      expect(first.taskTypeAllowlist).toEqual([fx.taskType]);
      await owner.commissions.revoke({ commissionId: first.id });

      const [revoked] = await db
        .select({ revokedAt: schema.agentCommissions.revokedAt })
        .from(schema.agentCommissions)
        .where(eq(schema.agentCommissions.id, first.id));
      expect(revoked!.revokedAt).not.toBeNull();

      // Re-grant with a NEW allowlist: must update the envelope and un-revoke,
      // re-using the same (ownerId, agentId) row rather than no-op'ing.
      const second = await owner.commissions.grant({
        taskTypeAllowlist: ["polish-text", "summarise-text"],
        sourceScope: "enrolled-challenges",
      });
      expect(second.id).toBe(first.id);
      expect(second.taskTypeAllowlist).toEqual([
        "polish-text",
        "summarise-text",
      ]);
      expect(second.revokedAt).toBeNull();

      // And the stored row reflects the re-grant (allowlist updated, un-revoked).
      const [stored] = await db
        .select({
          taskTypeAllowlist: schema.agentCommissions.taskTypeAllowlist,
          revokedAt: schema.agentCommissions.revokedAt,
        })
        .from(schema.agentCommissions)
        .where(eq(schema.agentCommissions.id, first.id));
      expect(stored!.taskTypeAllowlist).toEqual([
        "polish-text",
        "summarise-text",
      ]);
      expect(stored!.revokedAt).toBeNull();
    });

    // ── ADR-0029: competitive grids are claimable ONLY by the grid's own team ──

    it("competitive cell is claimable only by an agent whose owner is on the team", async () => {
      const { db, schema, eq } = m;
      const challengeId = 990000 + Math.floor(Math.random() * 9000);

      await ownerCaller(fx.ownerId).commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId: 12345,
          name: "Falcon",
          captainId: fx.ownerId,
          joinCode: `TEAM-${fx.suffix.slice(-8).toUpperCase()}`,
          maxSize: 5,
          status: "locked",
        })
        .returning();

      await db.insert(schema.challengeEnrollments).values({
        userId: fx.ownerId,
        challengeId,
        teamId: team!.id,
        status: "active",
      });

      const [grid] = await db
        .insert(schema.workGrids)
        .values({
          mode: "competitive",
          status: "active",
          challengeId,
          communityId: null,
          teamId: team!.id,
        })
        .returning();
      const [cell] = await db
        .insert(schema.workCells)
        .values({
          gridId: grid!.id,
          taskType: fx.taskType,
          verificationMode: "test",
          status: "pending",
          deadlineMinutes: 30,
        })
        .returning();

      const agentCall = agentCaller(fx.apiKeyRaw);
      const claimable = await agentCall.workGrid.listClaimable({
        gridId: grid!.id,
      });
      expect(claimable.map((c) => c.id)).toContain(cell!.id);

      const claimed = await agentCall.workGrid.claimCell({ cellId: cell!.id });
      expect(claimed.status).toBe("claimed");

      await db
        .delete(schema.workCells)
        .where(eq(schema.workCells.gridId, grid!.id));
      await db
        .delete(schema.workGrids)
        .where(eq(schema.workGrids.id, grid!.id));
      await db
        .delete(schema.challengeEnrollments)
        .where(eq(schema.challengeEnrollments.challengeId, challengeId));
      await db.delete(schema.teams).where(eq(schema.teams.id, team!.id));
    });

    it("competitive cell is NOT claimable by an agent whose owner is enrolled but not on the team", async () => {
      const { db, schema, eq, generateApiKey } = m;
      const challengeId = 980000 + Math.floor(Math.random() * 9000);

      const outsiderId = `it-outsider-${fx.suffix}`;
      const outsiderAgentId = `it-outsider-agent-${fx.suffix}`;
      await db.insert(schema.user).values({
        id: outsiderId,
        email: `it-outsider-${fx.suffix}@example.test`,
        name: "Outsider",
      });
      await db.insert(schema.memberProfiles).values({
        userId: outsiderId,
        displayName: "Outsider",
        xp: 0,
        level: 1,
      });
      await db.insert(schema.agentProfiles).values({
        id: outsiderAgentId,
        ownerId: outsiderId,
        name: "Outsider Agent",
        status: "active",
      });
      const { raw, hash, prefix } = generateApiKey();
      await db.insert(schema.agentApiKeys).values({
        agentId: outsiderAgentId,
        ownerId: outsiderId,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: [
          "read",
          "self-profile",
          "commission:claim-cell",
          "commission:submit-result",
        ],
        isActive: true,
      });
      await db.insert(schema.agentManifestAcceptances).values({
        ownerId: outsiderId,
        agentId: outsiderAgentId,
        manifestVersion: m.MANIFEST_VERSION,
      });
      await ownerCaller(outsiderId).commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId: 12345,
          name: "Hawk",
          captainId: fx.ownerId,
          joinCode: `TEAM-O${fx.suffix.slice(-7).toUpperCase()}`,
          maxSize: 5,
          status: "locked",
        })
        .returning();
      await db.insert(schema.challengeEnrollments).values({
        userId: outsiderId,
        challengeId,
        teamId: null,
        status: "active",
      });

      const [grid] = await db
        .insert(schema.workGrids)
        .values({
          mode: "competitive",
          status: "active",
          challengeId,
          communityId: null,
          teamId: team!.id,
        })
        .returning();
      const [cell] = await db
        .insert(schema.workCells)
        .values({
          gridId: grid!.id,
          taskType: fx.taskType,
          verificationMode: "test",
          status: "pending",
          deadlineMinutes: 30,
        })
        .returning();

      const outsiderCall = agentCaller(raw);
      const claimable = await outsiderCall.workGrid.listClaimable({
        gridId: grid!.id,
      });
      expect(claimable.map((c) => c.id)).not.toContain(cell!.id);

      await expect(
        outsiderCall.workGrid.claimCell({ cellId: cell!.id }),
      ).rejects.toThrow(/not a member of this grid's team/i);

      await db
        .delete(schema.workCells)
        .where(eq(schema.workCells.gridId, grid!.id));
      await db
        .delete(schema.workGrids)
        .where(eq(schema.workGrids.id, grid!.id));
      await db
        .delete(schema.challengeEnrollments)
        .where(eq(schema.challengeEnrollments.challengeId, challengeId));
      await db.delete(schema.teams).where(eq(schema.teams.id, team!.id));
      await db
        .delete(schema.agentApiKeys)
        .where(eq(schema.agentApiKeys.agentId, outsiderAgentId));
      await db
        .delete(schema.agentManifestAcceptances)
        .where(eq(schema.agentManifestAcceptances.agentId, outsiderAgentId));
      await db
        .delete(schema.agentCommissions)
        .where(eq(schema.agentCommissions.ownerId, outsiderId));
      await db
        .delete(schema.agentProfiles)
        .where(eq(schema.agentProfiles.id, outsiderAgentId));
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, outsiderId));
      await db.delete(schema.user).where(eq(schema.user.id, outsiderId));
    });
  },
);
