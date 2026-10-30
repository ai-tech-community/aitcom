import { beforeEach, expect, it, vi } from "vitest";

import {
  approvalReviewPath,
  presentApprovalDraft,
  viewerMayReviewDraft,
} from "@/server/agent/approval-queue";

const inserts: {
  type: string;
  status: string;
  content: string;
  metadata: Record<string, unknown>;
  targetId: string;
  ownerId: string;
}[] = [];

const state = vi.hoisted(() => ({
  agent: {
    agentId: "agent-a",
    ownerId: "owner-a" as string | null,
    scopes: ["read", "contribute"],
  },
}));

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://example.org",
    DATABASE_URL: "postgres://localhost:1/none",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => state.agent,
}));
vi.mock("@/server/db", () => ({
  db: {
    query: {
      communities: {
        findFirst: async () => ({
          id: "c1",
          slug: "dutch-together",
          name: "Dutch Together",
          classroomCreatePolicy: "all_members",
        }),
      },
    },
    insert: () => ({
      values: (row: (typeof inserts)[number]) => {
        inserts.push(row);
        return {
          returning: async () => [{ id: `draft-${inserts.length}` }],
        };
      },
    }),
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
  },
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: async ({
      collection,
      id,
    }: {
      collection: string;
      id: number;
    }) => {
      if (collection === "lessons") {
        return { id, course: 14, title: "Sounds and spelling" };
      }
      if (collection === "modules") {
        return { id, course: 14, title: "First sounds" };
      }
      return {
        id: 14,
        authorId: "owner-a",
        status: "published",
        slug: "dutch-from-zero",
        title: "Dutch from zero",
        communityId: "c1",
        summary: "Start here",
      };
    },
  }),
}));

import { createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import { agentClassroomRouter } from "./agent-classrooms";

const caller = () =>
  createTRPCRouter(agentClassroomRouter).createCaller({
    db,
    session: null,
    headers: new Headers({ authorization: "Bearer test-agent-key" }),
  });

beforeEach(() => {
  inserts.length = 0;
  state.agent = {
    agentId: "agent-a",
    ownerId: "owner-a",
    scopes: ["read", "contribute"],
  };
});

it("saves a published-course lesson edit as a draft and queues course and module edits for approval", async () => {
  const lesson = await caller().updateLesson({
    communitySlug: "dutch-together",
    lessonId: 26,
    title: "A0.1 Sounds",
  });
  expect(lesson).toMatchObject({ mode: "draft", status: "draft" });

  const course = await caller().updateClassroom({
    communitySlug: "dutch-together",
    courseId: 14,
    summary: "A public course",
  });
  expect(course).toMatchObject({ mode: "draft" });

  const moduleDraft = await caller().updateModule({
    communitySlug: "dutch-together",
    moduleId: 5,
    title: "Sounds",
  });
  expect(moduleDraft).toMatchObject({ mode: "draft", status: "draft" });

  expect(inserts.map((row) => row.type)).toEqual([
    "classroom_lesson",
    "classroom_course_update",
    "classroom_module",
  ]);
  expect(inserts.every((row) => row.status === "pending")).toBe(true);

  const queued = inserts.map((row, index) =>
    presentApprovalDraft({
      id: `draft-${index + 1}`,
      type: row.type,
      ownerId: row.ownerId,
      content: row.content,
      metadata: row.metadata,
      targetType: "courses",
      targetId: row.targetId,
      agentName: "Nova",
    }),
  );
  expect(queued.map((item) => item.kind)).toEqual([
    "LESSON",
    "COURSE",
    "MODULE",
  ]);
  for (const item of queued) {
    expect(item.reviewPath).toBe(`/news/stories/drafts/${item.id}`);
    expect(
      viewerMayReviewDraft({
        viewerId: "owner-a",
        newsStaff: false,
        ownedCommunityIds: new Set(),
        ownedCommunitySlugs: new Set(["dutch-together"]),
        draft: {
          id: item.id,
          type: item.type,
          ownerId: "owner-a",
          content: item.title,
          metadata: { destinationPath: item.reviewPath },
          targetType: "courses",
          targetId: null,
        },
      }),
    ).toBe(true);
    expect(
      approvalReviewPath({
        id: item.id,
        type: item.type,
        ownerId: "owner-a",
        content: item.title,
        metadata: inserts[Number(item.id.replace("draft-", "")) - 1]?.metadata,
        targetType: "courses",
        targetId: null,
      }),
    ).toBe(item.reviewPath);
  }
});
