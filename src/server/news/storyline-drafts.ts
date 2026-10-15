import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { agentDrafts, agentProfiles } from "@/server/db/schema";
import {
  summarizeStorylineDraft,
  type StorylineDraftSummary,
} from "@/lib/news/storyline-draft-review";
import { storylineInputSchema } from "@/lib/news/storylines";
import { saveStoryline, StorylineError } from "./storylines";

const NEWS_STORYLINE_DRAFT_TYPE = "news_storyline";

export type StorylineDraftRecord = StorylineDraftSummary & {
  input: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const draftColumns = {
  id: agentDrafts.id,
  ownerId: agentDrafts.ownerId,
  content: agentDrafts.content,
  status: agentDrafts.status,
  createdAt: agentDrafts.createdAt,
  metadata: agentDrafts.metadata,
  agentName: agentProfiles.name,
};

function present(row: {
  id: string;
  ownerId: string;
  content: string;
  status: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  agentName: string | null;
}): StorylineDraftRecord {
  const metadata = asRecord(row.metadata);
  const summary = summarizeStorylineDraft({ ...row, metadata });
  return { ...summary, input: metadata?.input ?? null };
}

/** Pending news storyline rows, including ones whose evidence no longer validates. */
export async function listPendingStorylineDrafts(filter?: {
  ownerId?: string;
}): Promise<StorylineDraftRecord[]> {
  const rows = await db
    .select(draftColumns)
    .from(agentDrafts)
    .leftJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(
      and(
        eq(agentDrafts.type, NEWS_STORYLINE_DRAFT_TYPE),
        eq(agentDrafts.status, "pending"),
        filter?.ownerId ? eq(agentDrafts.ownerId, filter.ownerId) : undefined,
      ),
    )
    .orderBy(desc(agentDrafts.createdAt), agentDrafts.id)
    .limit(50);
  return rows.map((row) => present(row));
}

export async function readStorylineDraft(
  draftId: string,
): Promise<StorylineDraftRecord | null> {
  const [row] = await db
    .select(draftColumns)
    .from(agentDrafts)
    .leftJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(
      and(
        eq(agentDrafts.id, draftId),
        eq(agentDrafts.type, NEWS_STORYLINE_DRAFT_TYPE),
      ),
    )
    .limit(1);
  return row ? present(row) : null;
}

/**
 * Owner or editor approval publishes the proposal. There is no second
 * publisher step. A proposal that cannot be published stays pending.
 */
export async function approveStorylineDraft(draftId: string, editorId: string) {
  const draft = await readStorylineDraft(draftId);
  if (!draft || draft.status !== "pending") {
    throw new StorylineError("conflict", "sourceDraftReviewed");
  }
  const parsed = storylineInputSchema.safeParse({
    ...(asRecord(draft.input) ?? {}),
    id: undefined,
    sourceDraftId: draftId,
    status: "published",
  });
  if (!parsed.success) throw new StorylineError("invalid", "sourceDraft");
  const input = { ...parsed.data };
  delete input.id;
  const saved = await saveStoryline(
    { ...input, sourceDraftId: draftId, status: "published" },
    editorId,
  );
  return { id: saved.id, slug: input.slug };
}
