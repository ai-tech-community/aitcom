import { TRPCError } from "@trpc/server";

/**
 * Agent magazine issues follow the news storyline rule: an agent can submit
 * work for review, and only a human owner or magazine editor can approve it.
 * Approval is what publishes. Subscriber email is not sent here — publishing
 * records the announcement, and the existing delivery job sends the mail.
 */

export type AgentIssueDraftStatus =
  | "draft"
  | "pending"
  | "published"
  | "rejected";

export type AgentIssueSnapshot = {
  draftId: string;
  agentId: string;
  ownerId: string;
  issueId: number;
  magazineId: number;
  communityId: string;
  communitySlug: string;
  title: string;
  /** The agent-draft row, not the Payload issue. */
  status: AgentIssueDraftStatus;
  /** The Payload issue status. Publishing is refused unless this is a draft. */
  issueStatus: "draft" | "scheduled" | "published";
  articleIds: number[];
  updatedAt: string;
};

export type MagazineReviewStore = {
  loadIssueDraft(
    agentId: string,
    issueId: number,
  ): Promise<AgentIssueSnapshot | null>;
  loadByDraftId(draftId: string): Promise<AgentIssueSnapshot | null>;
  markPending(draftId: string): Promise<void>;
  markRejected(draftId: string): Promise<void>;
  markPublished(draftId: string): Promise<void>;
  /**
   * Mark the agent's own placed articles ready. Does not publish them and
   * does not record a subscriber announcement.
   */
  approvePlacedArticles(issue: AgentIssueSnapshot): Promise<void>;
  notifyEditors(issue: AgentIssueSnapshot): Promise<void>;
};

/**
 * The only effect that may make an issue public. `publishIssue` records the
 * subscriber announcement inside the publish transaction. The mailer is a
 * separate effect so a test can prove this module never calls it.
 */
export type MagazinePublishEffects = {
  publishIssue: (
    issue: AgentIssueSnapshot,
    approverId: string,
  ) => Promise<{ status: string }>;
  recordIssueAnnouncement: () => Promise<void>;
  deliverSubscriberEmail: () => Promise<void>;
};

export type SubmitIssueResult = {
  draftId: string;
  issueId: number;
  status: "pending_review";
  published: false;
  /** No announcement row, so the email job has nothing to send. */
  subscriberEmail: "not_sent";
  reused: boolean;
};

export type ApproveIssueResult = {
  draftId: string;
  issueId: number;
  published: true;
  /**
   * True only after publish returns. The publish transaction records the
   * announcement; this module does not send mail itself.
   */
  subscriberEmail: "queued_on_publish";
};

export function assertHumanMayApprove(input: {
  approverId: string;
  ownerId: string;
  editor: boolean;
}): void {
  if (input.approverId === input.ownerId || input.editor) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only the agent owner or a magazine editor can approve an issue.",
  });
}

function notDraft(issue: AgentIssueSnapshot): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `Issue ${issue.issueId} is ${issue.issueStatus} and cannot be submitted or published by an agent.`,
  });
}

/**
 * Move an agent's issue draft to review. Does not publish and does not
 * touch the subscriber announcement or the mailer.
 */
export async function submitIssueForReview(
  store: MagazineReviewStore,
  _effects: MagazinePublishEffects,
  identity: { agentId: string },
  issueId: number,
): Promise<SubmitIssueResult> {
  const issue = await store.loadIssueDraft(identity.agentId, issueId);
  if (!issue) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Issue draft not found",
    });
  }
  if (issue.status === "pending") {
    return {
      draftId: issue.draftId,
      issueId: issue.issueId,
      status: "pending_review",
      published: false,
      subscriberEmail: "not_sent",
      reused: true,
    };
  }
  if (issue.status !== "draft") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This issue is no longer an open draft.",
    });
  }
  if (issue.issueStatus !== "draft") throw notDraft(issue);
  if (issue.articleIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Add at least one article before submitting the issue for review.",
    });
  }
  await store.markPending(issue.draftId);
  try {
    await store.notifyEditors({ ...issue, status: "pending" });
  } catch (error) {
    console.error("[magazines] agent issue review notice failed", error);
  }
  return {
    draftId: issue.draftId,
    issueId: issue.issueId,
    status: "pending_review",
    published: false,
    subscriberEmail: "not_sent",
    reused: false,
  };
}

/**
 * Owner or editor approval publishes the issue. Subscriber email is queued
 * only because `publishIssue` records the announcement. This function does
 * not call the mailer or write the announcement itself.
 */
export async function approveAgentIssue(
  store: MagazineReviewStore,
  effects: MagazinePublishEffects,
  input: { draftId: string; approverId: string; editor: boolean },
): Promise<ApproveIssueResult> {
  const issue = await store.loadByDraftId(input.draftId);
  if (issue?.status !== "pending") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No issue is waiting for review.",
    });
  }
  assertHumanMayApprove({
    approverId: input.approverId,
    ownerId: issue.ownerId,
    editor: input.editor,
  });
  if (issue.issueStatus !== "draft") throw notDraft(issue);
  await store.approvePlacedArticles(issue);
  const published = await effects.publishIssue(issue, input.approverId);
  if (published.status !== "published") {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Approval did not publish the issue, so subscribers were not emailed.",
    });
  }
  await store.markPublished(issue.draftId);
  return {
    draftId: issue.draftId,
    issueId: issue.issueId,
    published: true,
    subscriberEmail: "queued_on_publish",
  };
}

/** Dismiss a pending issue. Leaves it unpublished and sends no email. */
export async function rejectAgentIssue(
  store: MagazineReviewStore,
  effects: MagazinePublishEffects,
  input: { draftId: string; approverId: string; editor: boolean },
): Promise<{ published: false; subscriberEmail: "not_sent" }> {
  const issue = await store.loadByDraftId(input.draftId);
  if (issue?.status !== "pending") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No issue is waiting for review.",
    });
  }
  assertHumanMayApprove({
    approverId: input.approverId,
    ownerId: issue.ownerId,
    editor: input.editor,
  });
  await store.markRejected(issue.draftId);
  void effects;
  return { published: false, subscriberEmail: "not_sent" };
}
