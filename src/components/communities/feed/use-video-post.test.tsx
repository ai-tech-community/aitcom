import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { useVideoPost } from "./use-video-post";

const m = vi.hoisted(() => {
  class VideoTooLongError extends Error {}
  class UnsupportedVideoError extends Error {}
  return {
    VideoTooLongError,
    UnsupportedVideoError,
    canTranscode: vi.fn(),
    transcodeForUpload: vi.fn(),
    createUpload: vi.fn(),
    finish: vi.fn(),
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/video-transcode", () => ({
  VideoTooLongError: m.VideoTooLongError,
  UnsupportedVideoError: m.UnsupportedVideoError,
  canTranscode: m.canTranscode,
  transcodeForUpload: m.transcodeForUpload,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getActivity: { invalidate: m.invalidate },
        getFeed: { invalidate: m.invalidate },
        getReels: { invalidate: m.invalidate },
      },
    }),
    feed: {
      createVideoUpload: {
        useMutation: () => ({ mutateAsync: m.createUpload }),
      },
      finishVideoPost: { useMutation: () => ({ mutateAsync: m.finish }) },
    },
  },
}));

/** What one presigned POST carried; `order` checks the file field is last. */
type Sent = {
  url: string;
  fields: Record<string, string>;
  file: { type: string; size: number };
  order: string[];
};

/** Records every presigned POST and answers with `status`. */
class FakeXHR {
  static sent: Sent[] = [];
  static status = 204;
  status = 0;
  url = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  send(form: FormData) {
    const fields: Record<string, string> = {};
    const order: string[] = [];
    let file = { type: "", size: -1 };
    for (const [name, value] of form.entries()) {
      order.push(name);
      if (typeof value === "string") fields[name] = value;
      else file = { type: value.type, size: value.size };
    }
    FakeXHR.sent.push({ url: this.url, fields, file, order });
    queueMicrotask(() => {
      this.status = FakeXHR.status;
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

const video = new Blob(["video"], { type: "video/mp4" });
const thumbnail = new Blob(["thumbnail-bytes"], { type: "image/jpeg" });
const file = new File(["raw"], "clip.mov", { type: "video/quicktime" });
const input = {
  file,
  caption: "Look at this",
  visibility: "public" as const,
  topicSlug: "general",
};

const grant = {
  uploadId: "11111111-1111-4111-8111-111111111111",
  video: { url: "https://s3.test/video", fields: { key: "v.mp4" } },
  thumbnail: { url: "https://s3.test/thumb", fields: { key: "v.jpg" } },
};

function renderIt() {
  return renderHook(() => useVideoPost("mlops"), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

beforeEach(() => {
  FakeXHR.sent = [];
  FakeXHR.status = 204;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  m.canTranscode.mockResolvedValue(true);
  m.transcodeForUpload.mockResolvedValue({
    video,
    thumbnail,
    durationSeconds: 12.5,
    width: 720,
    height: 1280,
  });
  m.createUpload.mockResolvedValue(grant);
  m.finish.mockResolvedValue({ id: 7 });
  m.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useVideoPost", () => {
  it("prepares, uploads each file to its own grant, then posts", async () => {
    const { result } = renderIt();
    let ok = false;
    await act(async () => {
      ok = await result.current.post(input);
    });

    expect(ok).toBe(true);
    expect(result.current.state).toEqual({ step: "idle" });
    expect(m.transcodeForUpload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(m.createUpload).toHaveBeenCalledWith({
      communitySlug: "mlops",
      visibility: "public",
    });
    expect(FakeXHR.sent).toEqual([
      {
        url: grant.thumbnail.url,
        fields: { key: "v.jpg" },
        file: { type: "image/jpeg", size: thumbnail.size },
        order: ["key", "file"],
      },
      {
        url: grant.video.url,
        fields: { key: "v.mp4" },
        file: { type: "video/mp4", size: video.size },
        order: ["key", "file"],
      },
    ]);
    expect(m.finish).toHaveBeenCalledWith({
      communitySlug: "mlops",
      uploadId: grant.uploadId,
      caption: "Look at this",
      topicSlug: "general",
      durationSeconds: 12.5,
      width: 720,
      height: 1280,
    });
    expect(m.invalidate).toHaveBeenCalledWith({ communitySlug: "mlops" });
  });

  it.each([
    [
      "tooLong",
      () => m.transcodeForUpload.mockRejectedValue(new m.VideoTooLongError()),
    ],
    [
      "unreadable",
      () =>
        m.transcodeForUpload.mockRejectedValue(new m.UnsupportedVideoError()),
    ],
    ["unsupported", () => m.canTranscode.mockResolvedValue(false)],
  ] as const)(
    "shows %s and never uploads or posts when preparing fails",
    async (key, arrange) => {
      arrange();
      const { result } = renderIt();
      let ok = true;
      await act(async () => {
        ok = await result.current.post(input);
      });

      expect(ok).toBe(false);
      expect(result.current.state).toEqual({
        step: "error",
        message: en.communities.video[key],
        retryable: false,
      });
      expect(m.createUpload).not.toHaveBeenCalled();
      expect(FakeXHR.sent).toEqual([]);
      expect(m.finish).not.toHaveBeenCalled();
    },
  );

  it("does not start preparing when the browser cannot convert", async () => {
    m.canTranscode.mockResolvedValue(false);
    const { result } = renderIt();
    await act(async () => {
      await result.current.post(input);
    });
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
  });

  it("shows the daily limit message on TOO_MANY_REQUESTS", async () => {
    m.createUpload.mockRejectedValue(
      Object.assign(new Error("limit"), {
        data: { code: "TOO_MANY_REQUESTS" },
      }),
    );
    const { result } = renderIt();
    await act(async () => {
      await result.current.post(input);
    });
    expect(result.current.state).toEqual({
      step: "error",
      message: en.communities.video.limit,
      retryable: false,
    });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("shows the generic failure when the upload is refused", async () => {
    FakeXHR.status = 403;
    const { result } = renderIt();
    let ok = true;
    await act(async () => {
      ok = await result.current.post(input);
    });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({
      step: "error",
      message: en.communities.video.failed,
      retryable: true,
    });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("goes back to idle with no error when cancelled", async () => {
    m.transcodeForUpload.mockImplementation(
      (_file: File, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const { result } = renderIt();
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.post(input);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ step: "preparing", share: 0 });

    let ok = true;
    await act(async () => {
      result.current.cancel();
      ok = await pending;
    });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({ step: "idle" });
    expect(m.createUpload).not.toHaveBeenCalled();
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("cancels an upload that is already sending", async () => {
    const sending: FakeXHR[] = [];
    class HangingXHR extends FakeXHR {
      override send() {
        sending.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", HangingXHR);
    const { result } = renderIt();
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.post(input);
    });
    await vi.waitFor(() => expect(sending).toHaveLength(1));

    let ok = true;
    await act(async () => {
      result.current.cancel();
      ok = await pending;
    });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({ step: "idle" });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("ignores a second post while one is in flight", async () => {
    const { result } = renderIt();
    await act(async () => {
      const first = result.current.post(input);
      const second = await result.current.post(input);
      expect(second).toBe(false);
      await first;
    });
    expect(m.createUpload).toHaveBeenCalledTimes(1);
    expect(m.finish).toHaveBeenCalledTimes(1);
  });

  describe("retrying after a failed upload", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function failOnceThenRetry(
      result: { current: ReturnType<typeof useVideoPost> },
      beforeRetry: () => void = () => undefined,
    ) {
      FakeXHR.status = 500;
      await act(async () => {
        await result.current.post(input);
      });
      expect(result.current.state).toMatchObject({ step: "error" });
      FakeXHR.status = 204;
      beforeRetry();
      let ok = false;
      await act(async () => {
        ok = await result.current.post(input);
      });
      return ok;
    }

    it("reuses the prepared video and a fresh grant", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { result } = renderIt();
      const ok = await failOnceThenRetry(result, () =>
        vi.advanceTimersByTime(60_000),
      );
      expect(ok).toBe(true);
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(1);
      expect(m.createUpload).toHaveBeenCalledTimes(1);
      expect(m.finish).toHaveBeenCalledTimes(1);
      expect(m.finish).toHaveBeenCalledWith(
        expect.objectContaining({ uploadId: grant.uploadId }),
      );
    });

    it("asks for a new grant once the old one is about to expire", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { result } = renderIt();
      const ok = await failOnceThenRetry(result, () =>
        vi.advanceTimersByTime(9.5 * 60_000),
      );
      expect(ok).toBe(true);
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(1);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
    });

    it("asks for a new grant when the visibility changed", async () => {
      const { result } = renderIt();
      FakeXHR.status = 500;
      await act(async () => {
        await result.current.post(input);
      });
      FakeXHR.status = 204;
      await act(async () => {
        await result.current.post({ ...input, visibility: "community" });
      });
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(1);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
      expect(m.createUpload).toHaveBeenLastCalledWith({
        communitySlug: "mlops",
        visibility: "community",
      });
    });

    it("asks for a new grant when creating the post failed", async () => {
      m.finish.mockRejectedValueOnce(new Error("boom"));
      const { result } = renderIt();
      await act(async () => {
        await result.current.post(input);
      });
      await act(async () => {
        await result.current.post(input);
      });
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(1);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
    });

    it("prepares again for a different file", async () => {
      const { result } = renderIt();
      FakeXHR.status = 500;
      await act(async () => {
        await result.current.post(input);
      });
      FakeXHR.status = 204;
      const other = new File(["other"], "b.mov", { type: "video/quicktime" });
      await act(async () => {
        await result.current.post({ ...input, file: other });
      });
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(2);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
    });

    it("forgets the prepared video on reset (clip removed or replaced)", async () => {
      const { result } = renderIt();
      FakeXHR.status = 500;
      await act(async () => {
        await result.current.post(input);
      });
      act(() => result.current.reset());
      FakeXHR.status = 204;
      await act(async () => {
        await result.current.post(input);
      });
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(2);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
    });

    it("keeps the prepared video after a cancel, with a new grant", async () => {
      const sending: FakeXHR[] = [];
      class HangingXHR extends FakeXHR {
        override send() {
          sending.push(this);
        }
      }
      vi.stubGlobal("XMLHttpRequest", HangingXHR);
      const { result } = renderIt();
      let pending!: Promise<boolean>;
      act(() => {
        pending = result.current.post(input);
      });
      await vi.waitFor(() => expect(sending).toHaveLength(1));
      await act(async () => {
        result.current.cancel();
        await pending;
      });
      vi.stubGlobal("XMLHttpRequest", FakeXHR);
      let ok = false;
      await act(async () => {
        ok = await result.current.post(input);
      });
      expect(ok).toBe(true);
      expect(m.transcodeForUpload).toHaveBeenCalledTimes(1);
      expect(m.createUpload).toHaveBeenCalledTimes(2);
    });
  });
});
