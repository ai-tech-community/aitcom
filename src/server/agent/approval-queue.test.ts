import { expect, it } from "vitest";

import {
  approvalReviewPath,
  draftCommunityRef,
  presentApprovalDraft,
  viewerMayReviewDraft,
  type ApprovalDraftRow,
} from "./approval-queue";

const COURSE: ApprovalDraftRow = {
  id: "5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
  type: "classroom_course_update",
  ownerId: "agent-owner",
  content: "Mandarin from zero",
  metadata: {
    courseId: 16,
    status: "published",
    destinationLabel: "Mandarin from zero",
    destinationPath:
      "/communities/chinese-together/classroom/mandarin-from-zero",
  },
  targetType: "courses",
  targetId: "16",
};

const THREAD: ApprovalDraftRow = {
  id: "c818358c-9f60-4782-9b42-c65690a48f17",
  type: "thread_create",
  ownerId: "agent-owner",
  content: "Hello everyone",
  metadata: {
    title: "Welcome",
    communitySlug: "chinese-together",
    destinationPath: "/communities/chinese-together/forum",
  },
  targetType: "community",
  targetId: "community-1",
};

function may(
  draft: ApprovalDraftRow,
  viewer: {
    viewerId: string;
    newsStaff?: boolean;
    ids?: string[];
    slugs?: string[];
  },
) {
  return viewerMayReviewDraft({
    viewerId: viewer.viewerId,
    newsStaff: viewer.newsStaff ?? false,
    ownedCommunityIds: new Set(viewer.ids ?? []),
    ownedCommunitySlugs: new Set(viewer.slugs ?? []),
    draft,
  });
}

it("lets the agent owner and the community owner review a course or thread draft", () => {
  expect(draftCommunityRef(COURSE)).toEqual({
    slug: "chinese-together",
  });
  expect(draftCommunityRef(THREAD)).toEqual({
    id: "community-1",
    slug: "chinese-together",
  });
  expect(may(COURSE, { viewerId: "agent-owner" })).toBe(true);
  expect(may(COURSE, { viewerId: "stranger" })).toBe(false);
  expect(
    may(COURSE, { viewerId: "community-owner", slugs: ["chinese-together"] }),
  ).toBe(true);
  expect(
    may(THREAD, { viewerId: "community-owner", ids: ["community-1"] }),
  ).toBe(true);
  expect(may(THREAD, { viewerId: "other", slugs: ["dutch-together"] })).toBe(
    false,
  );
});

it("keeps news drafts with the agent owner or news staff, and points each kind at a review page", () => {
  const story: ApprovalDraftRow = {
    id: "story-1",
    type: "news_storyline",
    ownerId: "agent-owner",
    content: "A story",
    metadata: { title: "A story" },
    targetType: null,
    targetId: null,
  };
  expect(may(story, { viewerId: "editor", newsStaff: true })).toBe(true);
  expect(
    may(story, { viewerId: "community-owner", slugs: ["chinese-together"] }),
  ).toBe(false);
  expect(approvalReviewPath(COURSE)).toBe(
    "/news/stories/drafts/5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
  );
  expect(approvalReviewPath(THREAD)).toBe(`/news/stories/drafts/${THREAD.id}`);
  const issue: ApprovalDraftRow = {
    ...THREAD,
    type: "magazine_issue",
    metadata: {
      destinationPath:
        "/communities/dutch-together/magazine/agent-issues/issue-1",
    },
  };
  expect(approvalReviewPath(issue)).toBe(
    "/communities/dutch-together/magazine/agent-issues/issue-1",
  );
  expect(presentApprovalDraft({ ...COURSE, agentName: "Nova" })).toMatchObject({
    kind: "COURSE",
    title: "Mandarin from zero",
    agentName: "Nova",
  });
});
