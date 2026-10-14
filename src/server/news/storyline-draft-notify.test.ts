import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  inserted: [] as unknown[],
  docs: [] as Array<{ email?: string; role?: string }>,
}));
const send = vi.hoisted(() =>
  vi.fn(async (_to: string, opts: { reviewUrl: string }) => {
    void opts;
    return true;
  }),
);
vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "limit", "values"])
      chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    db: {
      select: () => query(() => state.rows.shift() ?? []),
      insert: () => ({
        values: (value: unknown) => {
          state.inserted.push(value);
          return Promise.resolve(undefined);
        },
      }),
    },
  };
});
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    find: async () => ({ docs: state.docs }),
  }),
}));
vi.mock("@/server/email", () => ({
  sendStorylineDraftReviewEmail: send,
}));
import { notifyStorylineDraftReview } from "./storyline-draft-notify";

const DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";

beforeEach(() => {
  state.rows = [];
  state.inserted = [];
  state.docs = [];
  send.mockReset();
  send.mockResolvedValue(true);
});

it("writes an in-app notice for the owner and editors with a direct review link", async () => {
  state.docs = [
    { email: "editor@example.com", role: "editor" },
    { email: "owner@example.com", role: "admin" },
  ];
  state.rows = [
    [{ id: "owner", email: "owner@example.com" }],
    [
      { id: "owner", email: "owner@example.com" },
      { id: "ed", email: "editor@example.com" },
    ],
  ];
  await notifyStorylineDraftReview(
    { draftId: DRAFT, ownerId: "owner", title: "Local AI" },
    { VERCEL_ENV: "preview", NODE_ENV: "test" },
  );
  const notices = state.inserted[0] as Array<{
    userId: string;
    metadata: { reviewPath: string; linkLabel: string };
  }>;
  expect(notices.map((notice) => notice.userId).sort()).toEqual([
    "ed",
    "owner",
  ]);
  expect(notices[0]?.metadata.reviewPath).toBe(`/news/stories/drafts/${DRAFT}`);
  expect(notices[0]?.metadata.linkLabel).toBe("Review this draft");
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map((call) => call[0]).sort()).toEqual([
    "editor@example.com",
    "owner@example.com",
  ]);
  expect(send.mock.calls[0]?.[1].reviewUrl).toContain(
    `/en/news/stories/drafts/${DRAFT}`,
  );
});

it("keeps the in-app notice when an email send fails", async () => {
  state.rows = [[{ id: "owner", email: "owner@example.com" }], []];
  send.mockRejectedValue(new Error("resend down"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(
    notifyStorylineDraftReview({
      draftId: DRAFT,
      ownerId: "owner",
      title: "Local AI",
    }),
  ).resolves.toBeUndefined();
  expect(state.inserted).toHaveLength(1);
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
