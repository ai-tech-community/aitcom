import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import {
  magazineThemeIssue,
  normalizeHexColor,
  type MagazineFontPairId,
} from "@/lib/magazines/theme";
import { magazineSettingsPath } from "@/lib/magazines/paths";
import type { PayloadClient } from "@/server/magazines/deps";
import { agentDrafts, communities } from "@/server/db/schema";

import type { Deps } from "./deps";
import { loadMagazineEditorship, requireCapability } from "./editorship";
import { magazineError } from "./errors";
import { findMagazineBySlug } from "./reading";

export const MAGAZINE_THEME_DRAFT_TYPE = "magazine_theme";

export type MagazineThemeDraft = {
  magazineId: number;
  fontPair: MagazineFontPairId;
  accent: string;
};

type DraftRow = {
  id: string;
  type: string;
  metadata: unknown;
};

/** The theme a pending draft will apply. Null when the draft is not one. */
export function magazineThemeFromDraft(
  draft: Pick<DraftRow, "type" | "metadata">,
): MagazineThemeDraft | null {
  if (draft.type !== MAGAZINE_THEME_DRAFT_TYPE) return null;
  if (!draft.metadata || typeof draft.metadata !== "object") return null;
  const meta = draft.metadata as {
    magazineId?: unknown;
    fontPair?: unknown;
    accent?: unknown;
  };
  if (
    typeof meta.magazineId !== "number" ||
    !Number.isInteger(meta.magazineId)
  ) {
    return null;
  }
  if (typeof meta.fontPair !== "string" || typeof meta.accent !== "string") {
    return null;
  }
  if (magazineThemeIssue(meta.fontPair, meta.accent)) return null;
  const accent = normalizeHexColor(meta.accent);
  if (!accent) return null;
  return {
    magazineId: meta.magazineId,
    fontPair: meta.fontPair as MagazineFontPairId,
    accent,
  };
}

/** Re-check live membership and settings capability before accepting a draft. */
export async function assertMagazineThemeManageable(
  deps: Deps,
  userId: string,
  theme: MagazineThemeDraft,
): Promise<void> {
  const magazine = await deps.payload.findByID({
    collection: "magazines",
    id: theme.magazineId,
    depth: 0,
    disableErrors: true,
  });
  if (!magazine) throw new TRPCError({ code: "NOT_FOUND" });
  const community = await deps.db.query.communities.findFirst({
    where: and(
      eq(communities.id, magazine.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { id: true },
  });
  if (!community) throw new TRPCError({ code: "FORBIDDEN" });
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: magazine.communityId, magazineId: magazine.id },
    userId,
  );
  requireCapability(standing, "manage");
}

export async function applyMagazineTheme(
  payload: PayloadClient,
  theme: MagazineThemeDraft,
): Promise<void> {
  await payload.update({
    collection: "magazines",
    id: theme.magazineId,
    depth: 0,
    data: { themeFontPair: theme.fontPair, themeAccent: theme.accent },
  });
}

/**
 * An editor agent's proposal. It stays a pending agent draft until the
 * agent's owner approves it. Approval is what writes the live theme.
 */
export async function proposeMagazineTheme(
  deps: Deps,
  identity: { agentId: string; ownerId: string },
  input: { magazineSlug: string; fontPair: string; accent: string },
): Promise<{ draftId: string; status: "pending" }> {
  const issue = magazineThemeIssue(input.fontPair, input.accent);
  if (issue) throw magazineError("THEME_INVALID");
  const accent = normalizeHexColor(input.accent);
  if (!accent) throw magazineError("THEME_INVALID");
  const magazine = await findMagazineBySlug(deps.payload, input.magazineSlug);
  if (!magazine) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: magazine.communityId, magazineId: magazine.id },
    identity.ownerId,
  );
  requireCapability(standing, "manage");
  const community = await deps.db.query.communities.findFirst({
    where: and(
      eq(communities.id, magazine.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { slug: true },
  });
  const content = `Theme ${input.fontPair}, accent ${accent}. Approving applies it to ${magazine.name}. It does not publish an issue.`;
  const metadata = {
    magazineId: magazine.id,
    magazineSlug: magazine.slug,
    communityId: magazine.communityId,
    fontPair: input.fontPair,
    accent,
    destinationLabel: magazine.name,
    ...(community
      ? { destinationPath: magazineSettingsPath(community.slug) }
      : {}),
  };
  const [pending] = await deps.db
    .select({ id: agentDrafts.id })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, identity.agentId),
        eq(agentDrafts.type, MAGAZINE_THEME_DRAFT_TYPE),
        eq(agentDrafts.targetId, String(magazine.id)),
        eq(agentDrafts.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) {
    await deps.db
      .update(agentDrafts)
      .set({ content, metadata })
      .where(eq(agentDrafts.id, pending.id));
    return { draftId: pending.id, status: "pending" };
  }
  const draftId = crypto.randomUUID();
  await deps.db.insert(agentDrafts).values({
    id: draftId,
    agentId: identity.agentId,
    ownerId: identity.ownerId,
    type: MAGAZINE_THEME_DRAFT_TYPE,
    targetType: "magazines",
    targetId: String(magazine.id),
    status: "pending",
    content,
    metadata,
  });
  return { draftId, status: "pending" };
}
