import { beforeEach, expect, it, vi } from "vitest";
import {
  approveAgentIssue,
  rejectAgentIssue,
  submitIssueForReview,
  type AgentIssueSnapshot,
  type MagazinePublishEffects,
  type MagazineReviewStore,
} from "./agent-magazine-review";

const issue: AgentIssueSnapshot = {
  draftId: "draft-1",
  agentId: "agent-a",
  ownerId: "owner-a",
  issueId: 7,
  magazineId: 3,
  communityId: "community-1",
  communitySlug: "local-ai",
  title: "Issue one",
  status: "draft",
  issueStatus: "draft",
  articleIds: [11],
  updatedAt: "2026-10-28T00:00:00.000Z",
};

function store(
  current: AgentIssueSnapshot | null = issue,
): MagazineReviewStore & {
  pending: boolean;
  published: boolean;
  approved: boolean;
} {
  const state = {
    row: current ? { ...current } : null,
    pending: false,
    published: false,
    approved: false,
  };
  return {
    get pending() {
      return state.pending;
    },
    get published() {
      return state.published;
    },
    get approved() {
      return state.approved;
    },
    loadIssueDraft: async (agentId, issueId) =>
      state.row &&
      state.row.agentId === agentId &&
      state.row.issueId === issueId
        ? state.row
        : null,
    loadByDraftId: async (draftId) =>
      state.row?.draftId === draftId ? state.row : null,
    markPending: async () => {
      state.pending = true;
      if (state.row) state.row = { ...state.row, status: "pending" };
    },
    markRejected: async () => {
      if (state.row) state.row = { ...state.row, status: "rejected" };
    },
    markPublished: async () => {
      state.published = true;
      if (state.row) state.row = { ...state.row, status: "published" };
    },
    approvePlacedArticles: async () => {
      state.approved = true;
    },
    notifyEditors: async () => undefined,
  };
}

function effects(): MagazinePublishEffects & {
  announcementRecorded: () => boolean;
} {
  let announcement = false;
  return {
    announcementRecorded: () => announcement,
    publishIssue: vi.fn(async () => {
      announcement = true;
      return { status: "published" };
    }),
    recordIssueAnnouncement: vi.fn(async () => undefined),
    deliverSubscriberEmail: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it("submits an issue for review without publishing or queueing subscriber email", async () => {
  const saved = store();
  const side = effects();
  const result = await submitIssueForReview(
    saved,
    side,
    { agentId: "agent-a" },
    7,
  );
  expect(result).toEqual({
    draftId: "draft-1",
    issueId: 7,
    status: "pending_review",
    published: false,
    subscriberEmail: "not_sent",
    reused: false,
  });
  expect(saved.pending).toBe(true);
  expect(saved.approved).toBe(false);
  expect(saved.published).toBe(false);
  expect(side.publishIssue).not.toHaveBeenCalled();
  expect(side.recordIssueAnnouncement).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
  expect(side.announcementRecorded()).toBe(false);
});

it("retries of a submitted issue stay in review and still do not publish", async () => {
  const saved = store({ ...issue, status: "pending" });
  const side = effects();
  const result = await submitIssueForReview(
    saved,
    side,
    { agentId: "agent-a" },
    7,
  );
  expect(result.reused).toBe(true);
  expect(result.subscriberEmail).toBe("not_sent");
  expect(side.publishIssue).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
});

it("refuses to submit an issue that is already published", async () => {
  const side = effects();
  await expect(
    submitIssueForReview(
      store({ ...issue, issueStatus: "published" }),
      side,
      { agentId: "agent-a" },
      7,
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(side.publishIssue).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
});

it("refuses an empty issue", async () => {
  const side = effects();
  await expect(
    submitIssueForReview(
      store({ ...issue, articleIds: [] }),
      side,
      { agentId: "agent-a" },
      7,
    ),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(side.publishIssue).not.toHaveBeenCalled();
});

it("lets the owner or an editor approve, which publishes and only then queues email", async () => {
  const saved = store({ ...issue, status: "pending" });
  const side = effects();
  const events: string[] = [];
  const approvePlacedArticles = saved.approvePlacedArticles.bind(saved);
  saved.approvePlacedArticles = async (row) => {
    events.push("approve-articles");
    await approvePlacedArticles(row);
  };
  const publishIssue = side.publishIssue;
  side.publishIssue = async (row, approverId) => {
    events.push("publish");
    return publishIssue(row, approverId);
  };
  const result = await approveAgentIssue(saved, side, {
    draftId: "draft-1",
    approverId: "owner-a",
    editor: false,
  });
  expect(result).toEqual({
    draftId: "draft-1",
    issueId: 7,
    published: true,
    subscriberEmail: "queued_on_publish",
  });
  expect(events).toEqual(["approve-articles", "publish"]);
  expect(saved.approved).toBe(true);
  expect(saved.published).toBe(true);
  expect(side.announcementRecorded()).toBe(true);
  expect(side.recordIssueAnnouncement).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
});

it("lets a magazine editor who is not the owner approve", async () => {
  const side = effects();
  await approveAgentIssue(store({ ...issue, status: "pending" }), side, {
    draftId: "draft-1",
    approverId: "editor-b",
    editor: true,
  });
  expect(side.publishIssue).toHaveBeenCalledOnce();
});

it("refuses a stranger, and does not publish or email", async () => {
  const side = effects();
  await expect(
    approveAgentIssue(store({ ...issue, status: "pending" }), side, {
      draftId: "draft-1",
      approverId: "stranger",
      editor: false,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(side.publishIssue).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
  expect(side.announcementRecorded()).toBe(false);
});

it("does not publish or email when an editor dismisses the issue", async () => {
  const side = effects();
  const result = await rejectAgentIssue(
    store({ ...issue, status: "pending" }),
    side,
    { draftId: "draft-1", approverId: "editor-b", editor: true },
  );
  expect(result).toEqual({ published: false, subscriberEmail: "not_sent" });
  expect(side.publishIssue).not.toHaveBeenCalled();
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
  expect(side.recordIssueAnnouncement).not.toHaveBeenCalled();
});

it("does not mark the draft published when publish fails, so email stays unqueued", async () => {
  const saved = store({ ...issue, status: "pending" });
  const side = effects();
  side.publishIssue = vi.fn(async () => {
    throw new Error("publish failed");
  });
  await expect(
    approveAgentIssue(saved, side, {
      draftId: "draft-1",
      approverId: "owner-a",
      editor: false,
    }),
  ).rejects.toThrow("publish failed");
  expect(saved.published).toBe(false);
  expect(side.deliverSubscriberEmail).not.toHaveBeenCalled();
  expect(side.announcementRecorded()).toBe(false);
});
