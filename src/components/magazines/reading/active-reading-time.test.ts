import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startActiveReadingTime,
  type ReadingSession,
} from "./active-reading-time";
import type { ReadingTimeInput } from "@/lib/magazines/reading-time";

const id = "788c43e9-bdc4-4e72-818e-f7fd0878b632";
let session: ReadingSession;
let visible: DocumentVisibilityState;
let focused: boolean;
let stop: (() => void) | undefined;
const request = vi.fn();
const reports = () =>
  request.mock.calls.map(
    ([, options]) => JSON.parse(options.body) as ReadingTimeInput,
  );
const latest = () => reports().at(-1)!;
const tick = (seconds: number) => vi.advanceTimersByTimeAsync(seconds * 1000);
beforeEach(() => {
  vi.useFakeTimers();
  visible = "visible";
  focused = true;
  session = { id, activeMs: 0 };
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visible,
  );
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  request
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => ({ recorded: true }) });
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("active reading timer", () => {
  it("reports cumulative page time, stops at idle and resumes on interaction", async () => {
    stop = startActiveReadingTime({ issueId: 7, articleId: 11 }, session);
    await tick(45);
    expect(latest()).toEqual({
      sessionId: id,
      issueId: 7,
      articleId: 11,
      activeSeconds: 45,
    });
    await tick(45);
    expect(session.activeMs).toBe(60_000);
    window.dispatchEvent(new Event("scroll"));
    await tick(15);
    expect(latest().activeSeconds).toBe(75);
    expect(request).toHaveBeenLastCalledWith(
      "/api/magazine-reading-time",
      expect.objectContaining({
        keepalive: true,
        credentials: "same-origin",
        method: "POST",
      }),
    );
  });

  it("flushes on hide and excludes all hidden time before resuming", async () => {
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(10);
    visible = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(latest().activeSeconds).toBe(10);
    await tick(40);
    expect(session.activeMs).toBe(10_000);
    visible = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await tick(15);
    expect(session.activeMs).toBe(25_000);
  });

  it("pauses on blur, starts no hidden/unfocused time and handles page restoration", async () => {
    focused = false;
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(20);
    expect(session.activeMs).toBe(0);
    focused = true;
    window.dispatchEvent(new Event("focus"));
    await tick(5);
    focused = false;
    window.dispatchEvent(new Event("blur"));
    expect(latest().activeSeconds).toBe(5);
    await tick(20);
    expect(session.activeMs).toBe(5000);
    focused = true;
    window.dispatchEvent(new Event("pageshow"));
    await tick(3);
    window.dispatchEvent(new Event("pagehide"));
    expect(latest().activeSeconds).toBe(8);
    await tick(10);
    expect(session.activeMs).toBe(8000);
  });

  it("ignores a long suspended timer gap", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    stop = startActiveReadingTime({ issueId: 7 }, session);
    now = 20_000;
    await tick(1);
    expect(session.activeMs).toBe(0);
    now = 21_000;
    await tick(1);
    expect(session.activeMs).toBe(1000);
  });

  it("retries cumulative data after failed reports without new session IDs", async () => {
    request.mockRejectedValue(new Error("offline"));
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(60);
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ recorded: false }),
    });
    await tick(15);
    expect(latest().activeSeconds).toBe(60);
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ recorded: true }),
    });
    await tick(15);
    expect(latest().activeSeconds).toBe(60);
    expect(new Set(reports().map((r) => r.sessionId))).toEqual(new Set([id]));
    await tick(15);
    expect(reports().filter((r) => r.activeSeconds === 60)).toHaveLength(3);
  });

  it("flushes fractional final time, disposes listeners and retains state across effect restarts", async () => {
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(2.5);
    stop();
    stop = undefined;
    expect(latest().activeSeconds).toBe(2);
    const count = request.mock.calls.length;
    window.dispatchEvent(new Event("scroll"));
    await tick(20);
    expect(request).toHaveBeenCalledTimes(count);
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(2.5);
    stop();
    stop = undefined;
    expect(latest()).toMatchObject({ sessionId: id, activeSeconds: 5 });
  });

  it("caps a page at two active hours", async () => {
    session.activeMs = 7_199_000;
    stop = startActiveReadingTime({ issueId: 7 }, session);
    await tick(20);
    expect(latest().activeSeconds).toBe(7200);
  });
});
