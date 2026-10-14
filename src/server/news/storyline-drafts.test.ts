import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  saved: vi.fn(async (input: { id?: string }, _editorId: string) => {
    void input;
    return { id: "story-1" };
  }),
}));
vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "leftJoin", "orderBy", "limit"])
      chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    db: {
      select: () => query(() => state.rows.shift() ?? []),
    },
  };
});
vi.mock("./storylines", () => ({
  saveStoryline: state.saved,
  StorylineError: class StorylineError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
import {
  approveStorylineDraft,
  listPendingStorylineDrafts,
  readStorylineDraft,
} from "./storyline-drafts";

const EXISTING = "f79b8204-0a7a-485a-82c9-a2a072034eab";

beforeEach(() => {
  state.rows = [];
  state.saved.mockClear();
});

it("lists an existing pending draft for its owner and for the editor queue", async () => {
  const row = {
    id: EXISTING,
    ownerId: "owner-a",
    content: "Broken evidence\n\nStill visible",
    status: "pending",
    createdAt: new Date("2026-10-14T12:00:00.000Z"),
    metadata: { input: { titleEn: "Stored title" } },
    agentName: "Member bot",
  };
  state.rows = [[row]];
  const owner = await listPendingStorylineDrafts({ ownerId: "owner-a" });
  expect(owner).toMatchObject([
    {
      id: EXISTING,
      title: "Stored title",
      ownerId: "owner-a",
      reviewPath: `/news/stories/drafts/${EXISTING}`,
    },
  ]);
  state.rows = [[row, { ...row, id: "other", ownerId: "owner-b" }]];
  const queue = await listPendingStorylineDrafts();
  expect(queue.map((draft) => draft.id)).toEqual([EXISTING, "other"]);
});

it("reads one draft without dropping it when the stored input is incomplete", async () => {
  state.rows = [
    [
      {
        id: EXISTING,
        ownerId: "owner-a",
        content: "Headline",
        status: "pending",
        createdAt: new Date(),
        metadata: null,
        agentName: null,
      },
    ],
  ];
  const draft = await readStorylineDraft(EXISTING);
  expect(draft?.title).toBe("Headline");
  expect(draft?.agentName).toBe("Connected agent");
});

it("approves by saving an editorial draft and refuses a proposal that is no longer pending", async () => {
  state.rows = [
    [
      {
        id: EXISTING,
        ownerId: "owner-a",
        content: "Local AI",
        status: "pending",
        createdAt: new Date(),
        metadata: {
          input: {
            slug: "local-ai",
            titleEn: "Local AI",
            status: "published",
            revision: 4,
            articles: [],
          },
        },
        agentName: "Member bot",
      },
    ],
  ];
  await expect(approveStorylineDraft(EXISTING, "editor")).resolves.toEqual({
    id: "story-1",
  });
  expect(state.saved).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceDraftId: EXISTING,
      status: "draft",
      titleEn: "Local AI",
    }),
    "editor",
  );
  expect(state.saved.mock.calls[0]?.[0]).not.toHaveProperty("id");
  state.rows = [
    [
      {
        id: EXISTING,
        ownerId: "owner-a",
        content: "Local AI",
        status: "approved",
        createdAt: new Date(),
        metadata: {},
        agentName: "Member bot",
      },
    ],
  ];
  await expect(approveStorylineDraft(EXISTING, "editor")).rejects.toMatchObject(
    { message: "sourceDraftReviewed" },
  );
});
