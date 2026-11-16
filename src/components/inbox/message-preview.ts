/** What a conversation list knows about a conversation's last message. */
export type LastMessagePreview = {
  content: string;
  attachmentKind: "gif" | null;
};

/**
 * The line a conversation list shows for the last message: its words when
 * it has any, else what it carries (a GIF-only message reads "GIF"), else
 * nothing.
 */
export function messagePreview(
  last: LastMessagePreview | null | undefined,
  gifLabel: string,
): string | null {
  if (!last) return null;
  if (last.content.trim()) return last.content;
  if (last.attachmentKind === "gif") return gifLabel;
  return null;
}
