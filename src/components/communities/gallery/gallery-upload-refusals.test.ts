import { describe, expect, it } from "vitest";

import { GALLERY_ERROR_CODES } from "@/lib/gallery-rules";

import { endsBatch, wouldRepeat } from "./gallery-upload-refusals";

describe("gallery upload refusals", () => {
  it.each([
    "FILE_TOO_LARGE",
    "FILE_TYPE_NOT_ALLOWED",
    "UNDECODABLE_PHOTO",
    "VIDEO_TOO_LONG",
    "UNSUPPORTED_VIDEO",
    "CANNOT_CONVERT_VIDEO",
  ] as const)(
    "%s is about the file: the next one still goes, and this one would fail again",
    (code) => {
      expect(endsBatch(code)).toBe(false);
      expect(wouldRepeat(code)).toBe(true);
    },
  );

  it.each([
    "UPLOAD_LIMIT",
    "BATCH_TOO_LARGE",
    "EVENT_NOT_ALLOWED",
    "TOPIC_NOT_FOUND",
    "NOT_A_MEMBER",
    "GALLERY_DISABLED",
    "NOT_ALLOWED",
    "PUBLIC_NOT_AVAILABLE",
  ] as const)(
    "%s holds for the whole batch and would repeat with the same settings",
    (code) => {
      expect(endsBatch(code)).toBe(true);
      expect(wouldRepeat(code)).toBe(true);
    },
  );

  it.each(["UPLOAD_EXPIRED", "STORAGE_FULL"] as const)(
    "%s ends the batch, but a new batch may get past it",
    (code) => {
      expect(endsBatch(code)).toBe(true);
      expect(wouldRepeat(code)).toBe(false);
    },
  );

  it("treats a failed transfer as one file's bad luck, worth a retry", () => {
    expect(endsBatch("UPLOAD_FAILED")).toBe(false);
    expect(wouldRepeat("UPLOAD_FAILED")).toBe(false);
  });

  it("classifies every code the server can send", () => {
    for (const code of GALLERY_ERROR_CODES) {
      expect(typeof endsBatch(code)).toBe("boolean");
      expect(typeof wouldRepeat(code)).toBe("boolean");
    }
  });
});
