import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXHR } from "@/test/fake-xhr";
import { uploadToGrant } from "./upload-to-grant";

const grant = {
  url: "https://s3.test/bucket",
  fields: {
    key: "private/classroom/c/1/u.pdf",
    "Content-Type": "application/pdf",
    Policy: "p",
  },
};
const blob = new Blob(["%PDF-1.7"], { type: "application/pdf" });

beforeEach(() => {
  FakeXHR.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadToGrant", () => {
  it("posts the signed fields, then the file last, and reports progress", async () => {
    const progress = vi.fn();
    await uploadToGrant(grant, blob, progress, new AbortController().signal);
    expect(FakeXHR.sent).toEqual([
      {
        url: "https://s3.test/bucket",
        fields: grant.fields,
        file: { type: "application/pdf", size: 8 },
        order: ["key", "Content-Type", "Policy", "file"],
      },
    ]);
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it("rejects when S3 refuses the upload", async () => {
    FakeXHR.mode = "http-error";
    await expect(
      uploadToGrant(grant, blob, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("upload failed with HTTP 403");
  });

  it("rejects on a network failure", async () => {
    FakeXHR.mode = "network-error";
    await expect(
      uploadToGrant(grant, blob, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("upload network error");
  });

  it("rejects with an AbortError when cancelled mid-upload", async () => {
    FakeXHR.mode = "hang";
    const controller = new AbortController();
    const sending = uploadToGrant(grant, blob, vi.fn(), controller.signal);
    controller.abort();
    await expect(sending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sends nothing when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadToGrant(grant, blob, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXHR.sent).toEqual([]);
  });
});
