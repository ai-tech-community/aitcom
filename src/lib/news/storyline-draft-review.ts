/** Shared copy, paths, and gates for a news storyline draft waiting on a human. */

export {
  MAIL_TEST_RECIPIENT as STORYLINE_TEST_RECIPIENT,
  gatedMailRecipient as storylineMailRecipient,
  type MailEnv as StorylineMailEnv,
} from "@/lib/email/recipient-gate";

export const STORYLINE_DRAFT_NOTIFICATION = "news_storyline_draft";
export const STORYLINE_DRAFT_QUEUE_PATH = "/news/stories/drafts";

export function storylineDraftReviewPath(draftId: string): string {
  return `${STORYLINE_DRAFT_QUEUE_PATH}/${encodeURIComponent(draftId)}`;
}

export type StorylineNotice = {
  userId: string | null;
  email: string;
  kind: "owner" | "editor";
};

/** Owner first, then editors. One notice per person, even if they are both. */
export function storylineReviewRecipients(input: {
  owner: { userId: string; email: string };
  editors: Array<{ userId: string | null; email: string }>;
}): StorylineNotice[] {
  const seenEmails = new Set<string>();
  const seenUsers = new Set<string>();
  const notices: StorylineNotice[] = [];
  const push = (notice: StorylineNotice) => {
    const email = notice.email.trim().toLowerCase();
    if (email && seenEmails.has(email)) return;
    if (notice.userId && seenUsers.has(notice.userId)) return;
    if (email) seenEmails.add(email);
    if (notice.userId) seenUsers.add(notice.userId);
    notices.push({ ...notice, email });
  };
  push({
    userId: input.owner.userId,
    email: input.owner.email,
    kind: "owner",
  });
  for (const editor of input.editors) {
    push({
      userId: editor.userId,
      email: editor.email,
      kind: "editor",
    });
  }
  return notices;
}

export function storylineDraftViewerRole(args: {
  viewerId: string | null;
  ownerId: string;
  staff: boolean;
}): "anonymous" | "denied" | "owner" | "editor" {
  if (!args.viewerId) return "anonymous";
  if (args.staff) return "editor";
  if (args.viewerId === args.ownerId) return "owner";
  return "denied";
}

export type StorylineDraftSummary = {
  id: string;
  ownerId: string;
  agentName: string;
  title: string;
  overview: string;
  status: string;
  createdAt: Date;
  reviewPath: string;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A pending row stays visible even when its stored input fails revalidation. */
export function summarizeStorylineDraft(draft: {
  id: string;
  ownerId: string;
  content: string;
  status: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  agentName: string | null;
}): StorylineDraftSummary {
  const input =
    draft.metadata &&
    typeof draft.metadata.input === "object" &&
    draft.metadata.input
      ? (draft.metadata.input as Record<string, unknown>)
      : null;
  const title =
    [
      stringField(input?.titleEn),
      stringField(draft.metadata?.title),
      stringField(draft.content.split("\n")[0]),
    ].find((value) => value.length > 0) ?? "Untitled draft";
  const fromInput = stringField(input?.overviewEn);
  const overview =
    fromInput.length > 0
      ? fromInput
      : draft.content.split("\n").slice(1).join("\n").trim();
  const agentName = draft.agentName?.trim() ?? "";
  return {
    id: draft.id,
    ownerId: draft.ownerId,
    agentName: agentName.length > 0 ? agentName : "Connected agent",
    title: title.slice(0, 200),
    overview: overview.slice(0, 500),
    status: draft.status,
    createdAt: draft.createdAt,
    reviewPath: storylineDraftReviewPath(draft.id),
  };
}

export function storylineDraftNotificationCopy(title: string): {
  title: string;
  content: string;
  linkLabel: string;
} {
  const name = title.trim() || "A news storyline";
  return {
    title: "A news storyline draft is waiting for review",
    content: `${name} is waiting for your review.`,
    linkLabel: "Review this draft",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderStorylineDraftReviewEmail(opts: {
  title: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const title = opts.title.trim() || "A news storyline";
  const subject = "A news storyline draft is waiting for review";
  const text = [
    subject,
    "",
    `${title} was proposed and is waiting for review.`,
    "",
    `Review this draft: ${opts.reviewUrl}`,
    "",
    "AIT Community",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #111; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px;">${escapeHtml(subject)}</h2>
      <p><strong>${escapeHtml(title)}</strong> was proposed and is waiting for review.</p>
      <p style="margin-top: 24px;">
        <a href="${escapeHtml(opts.reviewUrl)}" style="color: #111; font-weight: bold;">Review this draft →</a>
      </p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
      <p style="font-size: 13px; color: #595959;">AIT Community</p>
    </div>`;
  return { subject, html, text };
}

export function storylineDraftReviewUrl(
  draftId: string,
  origin: string,
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/en${storylineDraftReviewPath(draftId)}`;
}
