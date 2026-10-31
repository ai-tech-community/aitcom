import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  key: { ownerId: "owner", agentId: "agent", scopes: ["collect"] } as {
    ownerId: string | null;
    agentId: string;
    scopes: string[];
  } | null,

  runs: {
    listCollectors: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    listItems: vi.fn(),
  },
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/collectors/live", () => ({
  liveCollectorRuns: () => h.runs,
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => h.key,
}));
vi.mock("@/server/agent/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
}));
import { collectorsRouter } from "./collectors";
const db = {
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
};
function caller() {
  return collectorsRouter.createCaller({
    db,
    session: null,
    headers: new Headers({ authorization: "Bearer test" }),
  } as never);
}
const calls = () => [
  () => caller().agentList({}),
  () =>
    caller().agentStart({ collectorId: "hacker-news", input: { list: "top" } }),
  () => caller().agentRun({ runId: "r" }),
  () => caller().agentItems({ runId: "r", limit: 20, afterSeq: 3 }),
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  h.key = { ownerId: "owner", agentId: "agent", scopes: ["collect"] };

  h.runs.startRun.mockResolvedValue({ ok: true, runId: "r" });
  h.runs.getRun.mockResolvedValue({ id: "r", origin: "mcp" });
  h.runs.listItems.mockResolvedValue({
    items: [{ title: "Story" }],
    nextSeq: null,
  });
  h.runs.listCollectors.mockReturnValue([{ id: "hacker-news" }]);
});
describe("agent collection boundary", () => {
  it("uses the shared facade with the authenticated owner and agent identities", async () => {
    for (const call of calls()) await call();
    expect(h.runs.listCollectors).toHaveBeenCalledWith("en");
    expect(h.runs.startRun).toHaveBeenCalledWith({
      collectorId: "hacker-news",
      input: { list: "top" },
      userId: "owner",
      agentId: "agent",
      origin: "mcp",
    });
    expect(h.runs.getRun).toHaveBeenCalledWith("owner", "r");
    expect(h.runs.listItems).toHaveBeenCalledWith("owner", "r", {
      limit: 20,
      afterSeq: 3,
    });
  });
  it.each(["missing scope", "unclaimed", "revoked"])(
    "denies every tool when %s",
    async (reason) => {
      if (reason === "missing scope") h.key!.scopes = ["read"];
      if (reason === "unclaimed") h.key!.ownerId = null;
      if (reason === "revoked") h.key = null;
      for (const call of calls())
        await expect(call()).rejects.toMatchObject({
          code: reason === "revoked" ? "UNAUTHORIZED" : "FORBIDDEN",
        });
      for (const fn of Object.values(h.runs)) expect(fn).not.toHaveBeenCalled();
    },
  );
  it("passes quota refusals and hides missing/foreign datasets", async () => {
    h.runs.startRun.mockResolvedValue({ ok: false, reason: "quota" });
    expect(await calls()[1]!()).toEqual({ ok: false, reason: "quota" });
    h.runs.getRun.mockResolvedValue(null);
    h.runs.listItems.mockResolvedValue(null);
    for (const call of calls().slice(2))
      await expect(call()).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "RUN_NOT_FOUND",
      });
  });
});
