/**
 * E2E helper: ensure a dev agent (owned by the dev user) exists, set its
 * verification state, accept the current manifest, and mint a fresh API key.
 *
 * Used to drive the MCP-Apps interactive-message E2E (Slice 1, Phase 5):
 * with the printed key you can call inbox.agentSendMessage with a uiResource
 * and assert the resulting messages.ui_producer_trust tier.
 *
 * agent_profile.ownerId is UNIQUE, so the dev user owns exactly one agent;
 * this find-or-creates it and flips isVerified per the VERIFIED env.
 *
 *   VERIFIED=false tsx scripts/seed-dev-agent.ts   # -> "agent" tier
 *   VERIFIED=true  tsx scripts/seed-dev-agent.ts   # -> "verified_agent" tier
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  agentApiKeys,
  agentManifestAcceptances,
  agentProfiles,
  user,
} from "@/server/db/schema";
import { generateApiKey } from "@/server/agent/api-key";
import { MANIFEST_VERSION } from "@/server/agent/manifest";

const email = process.env.DEV_USER_EMAIL ?? "dev@aitcommunity.local";
const verified = process.env.VERIFIED === "true";

async function main() {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!owner) {
    throw new Error(
      `Dev user ${email} not found. Run: tsx scripts/seed-dev-user.ts`,
    );
  }

  // Find-or-create the dev user's agent (ownerId is unique).
  let [agent] = await db
    .select({ id: agentProfiles.id, isVerified: agentProfiles.isVerified })
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, owner.id))
    .limit(1);

  if (!agent) {
    [agent] = await db
      .insert(agentProfiles)
      .values({
        ownerId: owner.id,
        name: "Dev Agent",
        status: "active",
        registrationMethod: "owner",
        isVerified: verified,
      })
      .returning({
        id: agentProfiles.id,
        isVerified: agentProfiles.isVerified,
      });
  } else {
    await db
      .update(agentProfiles)
      .set({ isVerified: verified, verifiedAt: verified ? new Date() : null })
      .where(eq(agentProfiles.id, agent.id));
  }

  const agentId = agent!.id;

  // Accept the current manifest for the owner so "contribute" scope is granted.
  const [accepted] = await db
    .select({ id: agentManifestAcceptances.id })
    .from(agentManifestAcceptances)
    .where(eq(agentManifestAcceptances.ownerId, owner.id))
    .limit(1);

  if (!accepted) {
    await db.insert(agentManifestAcceptances).values({
      ownerId: owner.id,
      agentId,
      manifestVersion: MANIFEST_VERSION,
    });
  }

  // Mint a fresh key; deactivate prior keys for this agent.
  await db
    .update(agentApiKeys)
    .set({ isActive: false })
    .where(eq(agentApiKeys.agentId, agentId));

  const { raw, hash, prefix } = generateApiKey();
  await db.insert(agentApiKeys).values({
    agentId,
    ownerId: owner.id,
    keyHash: hash,
    keyPrefix: prefix,
    scopes: ["read", "contribute", "self-profile"],
  });

  // Machine-readable output for the E2E driver.
  console.log(
    JSON.stringify(
      { ownerId: owner.id, agentId, isVerified: verified, apiKey: raw },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("seed-dev-agent failed:", err);
    process.exit(1);
  });
