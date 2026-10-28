import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  agent: {
    agentId: "agent-a",
    ownerId: "owner-a" as string | null,
    scopes: ["read", "contribute"],
  },
  browse: vi.fn(),
  saveArticle: vi.fn(),
  saveIssue: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/server/db", () => ({
  db: { update: () => ({ set: () => ({ where: async () => undefined }) }) },
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
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({ id: "payload" }),
}));
vi.mock("@/server/magazines/agent-magazine", () => ({
  browseMagazines: state.browse,
  saveMagazineArticle: state.saveArticle,
  saveMagazineIssue: state.saveIssue,
  submitAgentIssue: state.submit,
}));
vi.mock("@/server/magazines/agent-image", () => ({
  uploadMagazineImage: state.upload,
}));
import { createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import { agentMagazineRouter } from "./agent-magazines";

const caller = (key = true) =>
  createTRPCRouter(agentMagazineRouter).createCaller({
    db,
    session: null,
    headers: new Headers(key ? { authorization: "Bearer test-agent-key" } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.agent = {
    agentId: "agent-a",
    ownerId: "owner-a",
    scopes: ["read", "contribute"],
  };
  state.submit.mockResolvedValue({
    status: "pending_review",
    published: false,
    subscriberEmail: "not_sent",
  });
  state.saveArticle.mockResolvedValue({ status: "draft", articleId: 1 });
  state.saveIssue.mockResolvedValue({ status: "draft", issueId: 2 });
  state.upload.mockResolvedValue({
    url: "https://cdn.example.test/cover.png",
    id: 9,
  });
});

it("exposes no procedure that publishes an issue", () => {
  expect(Object.keys(agentMagazineRouter).sort()).toEqual([
    "assignMagazineAgent",
    "browseMagazines",
    "createMagazine",
    "saveMagazineArticle",
    "saveMagazineIssue",
    "submitIssueForReview",
    "uploadImage",
  ]);
  expect(agentMagazineRouter).not.toHaveProperty("publishIssue");
  expect(agentMagazineRouter).not.toHaveProperty("approveAgentMagazineIssue");
});

it("requires read scope to browse and does not need contribute", async () => {
  await expect(caller(false).browseMagazines({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  state.agent.scopes = [];
  await expect(caller().browseMagazines({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  state.agent.scopes = ["read"];
  state.agent.ownerId = null;
  state.browse.mockResolvedValue({ magazines: [] });
  await caller().browseMagazines({ magazineSlug: "town" });
  expect(state.browse).toHaveBeenCalledWith(
    expect.anything(),
    { agentId: "agent-a", ownerId: null },
    { magazineSlug: "town", page: 1 },
  );
});

it("requires contribute scope and a claimed owner to draft, upload, or submit", async () => {
  state.agent.scopes = ["read"];
  await expect(
    caller().saveMagazineArticle({
      magazineSlug: "town",
      title: "Hi",
      body: "There",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller().uploadImage({
      magazineSlug: "town",
      url: "https://cdn.example.test/a.png",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller().saveMagazineIssue({ magazineSlug: "town", title: "Issue" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    caller().submitIssueForReview({ issueId: 4 }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  state.agent.scopes = ["read", "contribute"];
  state.agent.ownerId = null;
  await expect(
    caller().submitIssueForReview({ issueId: 4 }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state.submit).not.toHaveBeenCalled();
  expect(state.saveArticle).not.toHaveBeenCalled();
  expect(state.saveIssue).not.toHaveBeenCalled();
  expect(state.upload).not.toHaveBeenCalled();
});

it("submits for review as the authenticated agent and cannot ask to publish", async () => {
  const result = await caller().submitIssueForReview({
    issueId: 4,
    publish: true,
    status: "published",
  } as { issueId: number });
  expect(result).toMatchObject({
    published: false,
    subscriberEmail: "not_sent",
  });
  expect(state.submit).toHaveBeenCalledWith(
    expect.objectContaining({ payload: { id: "payload" } }),
    { agentId: "agent-a", ownerId: "owner-a" },
    4,
  );
});

it("saves article and issue drafts without a status field the agent can set", async () => {
  await caller().saveMagazineArticle({
    magazineSlug: "town",
    title: "Notes",
    body: "The agent's words.",
    coverImageUrl: "https://cdn.example.test/a.png",
  });
  expect(state.saveArticle).toHaveBeenCalledWith(
    expect.anything(),
    { agentId: "agent-a", ownerId: "owner-a" },
    expect.objectContaining({
      magazineSlug: "town",
      title: "Notes",
      body: "The agent's words.",
    }),
  );
  const articleInput = state.saveArticle.mock.calls[0]![2] as Record<
    string,
    unknown
  >;
  expect(articleInput).not.toHaveProperty("status");
  expect(articleInput).not.toHaveProperty("reviewStatus");

  await caller().saveMagazineIssue({
    magazineSlug: "town",
    title: "Issue one",
    articleIds: [3, 4],
    coverImageUrl: "https://cdn.example.test/cover.png",
  });
  const issueInput = state.saveIssue.mock.calls[0]![2] as Record<
    string,
    unknown
  >;
  expect(issueInput).not.toHaveProperty("status");
  expect(issueInput.articleIds).toEqual([3, 4]);
});
