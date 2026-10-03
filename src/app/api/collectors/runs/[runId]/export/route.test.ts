import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  session: { user: { id: "user-1" } } as { user: { id: string } } | null,
  exportRun: vi.fn(),
  getRun: vi.fn(),
}));

vi.mock("@/server/collectors/flags", () => ({
  collectorsEnabled: () => h.enabled,
}));
vi.mock("@/server/collectors/live", () => ({
  liveCollectorRuns: () => ({ exportRun: h.exportRun, getRun: h.getRun }),
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
  h.getRun.mockResolvedValue({ id: "run-1", status: "succeeded" });
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
    h.getRun.mockResolvedValue(null);
    expect((await GET(req("csv"), params())).status).toBe(404);
    expect(h.getRun).toHaveBeenCalledWith("user-1", "run-1");
    expect(h.exportRun).not.toHaveBeenCalled();
  });

  it("is not found when the run disappears before the export starts", async () => {
    h.exportRun.mockResolvedValue(null);
    expect((await GET(req("csv"), params())).status).toBe(404);
  });

  it.each(["queued", "running"])(
    "refuses to export a %s run: the file would be incomplete",
    async (status) => {
      h.getRun.mockResolvedValue({ id: "run-1", status });
      const res = await GET(req("csv"), params());
      expect(res.status).toBe(409);
      expect(await res.text()).toBe("Run still in progress");
      expect(h.exportRun).not.toHaveBeenCalled();
    },
  );

  it("passes the json format through to the export", async () => {
    h.exportRun.mockResolvedValue({
      filename: "feed-items-abcd1234.json",
      contentType: "application/json; charset=utf-8",
      body: chunks("[]"),
    });
    const res = await GET(req("json"), params());
    expect(res.status).toBe(200);
    expect(h.exportRun).toHaveBeenCalledWith("user-1", "run-1", "json");
    expect(await res.text()).toBe("[]");
  });

  it("reads the rows lazily and stops reading when the download is cancelled", async () => {
    let pulled = 0;
    let closed = false;
    async function* counting() {
      try {
        for (;;) {
          pulled += 1;
          yield `row ${pulled}\r\n`;
        }
      } finally {
        closed = true;
      }
    }
    h.exportRun.mockResolvedValue({
      filename: "feed-items-abcd1234.csv",
      contentType: "text/csv; charset=utf-8",
      body: counting(),
    });
    const res = await GET(req("csv"), params());
    await Promise.resolve();
    expect(pulled).toBeLessThanOrEqual(1);
    const serverLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await res.body!.cancel();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(closed).toBe(true);
      // A read in flight when the cancel lands is dropped, not an error.
      expect(serverLog).not.toHaveBeenCalled();
    } finally {
      serverLog.mockRestore();
    }
  });

  it("logs a failure mid-download with the run id and ends the stream with an error", async () => {
    const serverLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    async function* failing() {
      yield "a,b\r\n";
      throw new Error("connection lost");
    }
    h.exportRun.mockResolvedValue({
      filename: "feed-items-abcd1234.csv",
      contentType: "text/csv; charset=utf-8",
      body: failing(),
    });
    try {
      const res = await GET(req("csv"), params());
      await expect(res.text()).rejects.toThrow("connection lost");
      expect(serverLog).toHaveBeenCalledWith(
        "[collectors] export of run run-1 failed",
        expect.objectContaining({ message: "connection lost" }),
      );
    } finally {
      serverLog.mockRestore();
    }
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
