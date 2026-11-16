import { asc, inArray } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import { messageAttachments } from "@/server/db/schema";

type Db = typeof Database;
type AttachmentRow = typeof messageAttachments.$inferSelect;

/**
 * An attachment as readers of a message get it. Only the GIF is sendable
 * today; each further kind joins as its own member of this union.
 */
export type MessageAttachmentView = {
  id: string;
  kind: "gif";
  position: number;
  title: string;
  mp4Url: string;
  stillUrl: string;
  width: number;
  height: number;
};

/**
 * The view of a stored attachment row, or null for a kind this build does
 * not show yet (a reader never gets a half-filled attachment).
 */
export function attachmentView(
  row: AttachmentRow,
): MessageAttachmentView | null {
  switch (row.kind) {
    case "gif":
      // The table's CHECK keeps a gif row's GIPHY addresses non-null.
      if (!row.mp4Url || !row.stillUrl) return null;
      return {
        id: row.id,
        kind: "gif",
        position: row.position,
        title: row.title ?? "",
        mp4Url: row.mp4Url,
        stillUrl: row.stillUrl,
        width: row.width ?? 0,
        height: row.height ?? 0,
      };
    default:
      return null;
  }
}

/** Views of stored rows, in send order, without kinds not shown yet. */
export function attachmentViews(
  rows: AttachmentRow[],
): MessageAttachmentView[] {
  return rows
    .map(attachmentView)
    .filter((view): view is MessageAttachmentView => view !== null)
    .sort((a, b) => a.position - b.position);
}

/** Each message's attachments in send order, read in one query. */
export async function loadAttachments(
  db: Db,
  messageIds: string[],
): Promise<Map<string, MessageAttachmentView[]>> {
  const byMessage = new Map<string, MessageAttachmentView[]>();
  if (messageIds.length === 0) return byMessage;
  const rows = await db
    .select()
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, messageIds))
    .orderBy(
      asc(messageAttachments.messageId),
      asc(messageAttachments.position),
    );
  for (const row of rows) {
    const view = attachmentView(row);
    if (!view) continue;
    const list = byMessage.get(row.messageId) ?? [];
    list.push(view);
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

/** The messages, each with its attachments (an empty list when none). */
export async function withAttachments<T extends { id: string }>(
  db: Db,
  rows: T[],
): Promise<Array<T & { attachments: MessageAttachmentView[] }>> {
  const byMessage = await loadAttachments(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    attachments: byMessage.get(row.id) ?? [],
  }));
}

/**
 * The kind of a message's first attachment, or null when it has none: what
 * a one-line preview needs to say a message carries something.
 */
export function attachmentKind(
  attachments: MessageAttachmentView[],
): MessageAttachmentView["kind"] | null {
  return attachments[0]?.kind ?? null;
}

/** How one attachment reads where only text can be shown. */
function standInFor(attachment: MessageAttachmentView): string {
  switch (attachment.kind) {
    case "gif":
      return attachment.title ? `[GIF: ${attachment.title}]` : "[GIF]";
  }
}

/**
 * What stands in for a message's attachments where only text can be shown
 * (previews, emails, agent tools): "" when it has none.
 */
export function attachmentStandIn(
  attachments: MessageAttachmentView[],
): string {
  return attachments.map(standInFor).join(" ");
}

/** A message as text-only readers get it: its words, then its stand-in. */
export function textForReaders(
  content: string,
  attachments: MessageAttachmentView[],
): string {
  return [content, attachmentStandIn(attachments)]
    .filter((part) => part !== "")
    .join("\n");
}
