import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXHR } from "@/test/fake-xhr";
import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
  discard: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: {
        listCourseMaterials: { invalidate: m.invalidate },
      },
    }),
    classroomMaterials: {
      startFileUpload: { useMutation: () => ({ mutateAsync: m.start }) },
      finishFileUpload: { useMutation: () => ({ mutateAsync: m.finish }) },
      discardUpload: { useMutation: () => ({ mutateAsync: m.discard }) },
    },
  },
}));

import { useFileUpload } from "./use-file-upload";

const files = en.classroom.files;
// The browser often reports no type for .key or .csv files; the grant's type wins.
const pdf = new File(["%PDF-1.7 hello"], "Week 1.pdf", { type: "" });
const grant = {
  materialId: 7,
  upload: {
    url: "https://s3.test/",
    fields: { key: "k", "Content-Type": "application/pdf" },
  },
  contentType: "application/pdf",
};

function renderIt(courseId: number | null = 5) {
  return renderHook(() => useFileUpload(courseId), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={en}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

beforeEach(() => {
  FakeXHR.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  m.start.mockResolvedValue(grant);
  m.finish.mockResolvedValue({ id: 7, status: "ready" });
  m.discard.mockResolvedValue({ id: 7, status: "failed" });
  m.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useFileUpload", () => {
  it("asks for a grant with the picked file's real name and size, uploads with the server's type, then finishes", async () => {
    const { result } = renderIt();
    let done: { id: number } | null = null;
    await act(async () => {
      done = await result.current.upload(pdf);
    });
    expect(done).toEqual({ id: 7 });
    expect(m.start).toHaveBeenCalledWith({
      courseId: 5,
      fileName: "Week 1.pdf",
      bytes: pdf.size,
    });
    expect(FakeXHR.sent).toEqual([
      {
        url: "https://s3.test/",
        fields: grant.upload.fields,
        file: { type: "application/pdf", size: pdf.size },
        order: ["key", "Content-Type", "file"],
      },
    ]);
    expect(m.finish).toHaveBeenCalledWith({ materialId: 7 });
    expect(m.invalidate).toHaveBeenCalledWith({ courseId: 5 });
    expect(m.discard).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ step: "idle" });
  });

  it.each([
    ["FILE_TYPE_NOT_ALLOWED", files.errorType],
    ["FILE_EMPTY", files.errorEmpty],
    ["FILE_TOO_LARGE", files.errorTooLarge],
    ["STORAGE_FULL", files.errorStorageFull],
    ["UPLOADS_NOT_ALLOWED", files.errorNotAllowed],
    ["UPLOAD_LIMIT", files.errorDailyLimit],
    ["SOMETHING_ELSE", files.errorFailed],
  ])(
    "explains a refused start (%s) in everyday words",
    async (code, message) => {
      m.start.mockRejectedValue(new Error(code));
      const { result } = renderIt();
      await act(async () => {
        await result.current.upload(pdf);
      });
      expect(result.current.state).toEqual({ step: "error", message });
      expect(FakeXHR.sent).toEqual([]);
      expect(m.discard).not.toHaveBeenCalled();
    },
  );

  it("discards the upload when sending the file fails", async () => {
    FakeXHR.mode = "http-error";
    const { result } = renderIt();
    await act(async () => {
      await result.current.upload(pdf);
    });
    expect(result.current.state).toEqual({
      step: "error",
      message: files.errorFailed,
    });
    expect(m.discard).toHaveBeenCalledWith({ materialId: 7 });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("keeps the record when finishing fails (the server marked it failed)", async () => {
    m.finish.mockRejectedValue(new Error("UPLOAD_FAILED"));
    const { result } = renderIt();
    await act(async () => {
      await result.current.upload(pdf);
    });
    expect(result.current.state).toEqual({
      step: "error",
      message: files.errorFailed,
    });
    expect(m.discard).not.toHaveBeenCalled();
  });

  it("cancelling goes back to idle and discards the upload", async () => {
    FakeXHR.mode = "hang";
    const { result } = renderIt();
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.upload(pdf);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(result.current.state).toEqual({ step: "idle" });
    expect(m.discard).toHaveBeenCalledWith({ materialId: 7 });
    expect(m.finish).not.toHaveBeenCalled();
  });

  it("does nothing without a course", async () => {
    const { result } = renderIt(null);
    await act(async () => {
      expect(await result.current.upload(pdf)).toBeNull();
    });
    expect(m.start).not.toHaveBeenCalled();
  });
});
