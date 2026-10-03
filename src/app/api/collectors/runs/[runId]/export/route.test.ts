import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  session: { user: { id: "user-1" } } as { user: { id: string } } | null,
  exportRun: vi.fn(),
}));

vi.mock("@/server/collectors/flags", () => ({
  collectorsEnabled: () => h.enabled,
}));
vi.mock("@/server/collectors/live", () => ({
  liveCollectorRuns: () => ({ exportRun: h.exportRun }),
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => h.session,
}));

import { GET } from "./route";

const params = (runId = "run-1") => ({ params: Promise.resolve({ runId }) });
const req = (format?: string) =>
  new Request(
    `https://x.test/api/collectors/runs/run-1/export${format ? `?format=${format}` : ""}`,
  );

async function* chunks(...parts: string[]) {
  yield* parts;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.enabled = true;
  h.session = { user: { id: "user-1" } };
  h.exportRun.mockResolvedValue({
    filename: "feed-items-abcd1234.csv",
    contentType: "text/csv; charset=utf-8",
    body: chunks("a,b\r\n", "1,2\r\n"),
  });
});

describe("collector run export", () => {
  it("is not found while the feature is off", async () => {
    h.enabled = false;
    expect((await GET(req("csv"), params())).status).toBe(404);
    expect(h.exportRun).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    h.session = null;
    expect((await GET(req("csv"), params())).status).toBe(401);
  });

  it("refuses an unknown format", async () => {
    expect((await GET(req("xlsx"), params())).status).toBe(400);
    expect((await GET(req(), params())).status).toBe(400);
  });

  it("is not found for another member's run", async () => {
    h.exportRun.mockResolvedValue(null);
    expect((await GET(req("csv"), params())).status).toBe(404);
    expect(h.exportRun).toHaveBeenCalledWith("user-1", "run-1", "csv");
  });

  it("streams the file as a private download", async () => {
    const res = await GET(req("csv"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="feed-items-abcd1234.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("a,b\r\n1,2\r\n");
  });
});
