// src/lib/gallery-report-reasons.test.ts
import { describe, expect, it } from "vitest";

import {
  GALLERY_REPORT_NOTE_MAX,
  GALLERY_REPORT_REASON_LABELS,
  GALLERY_REPORT_REASONS,
} from "./gallery-report-reasons";
import {
  REPORT_NOTE_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
} from "./post-report-reasons";

describe("gallery report reasons", () => {
  it("are the feed's reasons plus this_is_me, in order", () => {
    expect(GALLERY_REPORT_REASONS).toEqual([
      "spam",
      "inappropriate",
      "copyright",
      "other",
      "this_is_me",
    ]);
    expect(GALLERY_REPORT_REASONS).toEqual([...REPORT_REASONS, "this_is_me"]);
  });

  it("allow the same note length as a feed report", () => {
    expect(REPORT_NOTE_MAX).toBe(500);
    expect(GALLERY_REPORT_NOTE_MAX).toBe(REPORT_NOTE_MAX);
  });

  it("leave the feed's own list untouched", () => {
    expect(REPORT_REASONS).toEqual([
      "spam",
      "inappropriate",
      "copyright",
      "other",
    ]);
    expect(REPORT_REASONS).not.toContain("this_is_me");
  });

  it("label every reason, reusing the feed's labels", () => {
    expect(Object.keys(GALLERY_REPORT_REASON_LABELS)).toEqual([
      ...GALLERY_REPORT_REASONS,
    ]);
    for (const reason of REPORT_REASONS) {
      expect(GALLERY_REPORT_REASON_LABELS[reason]).toBe(
        REPORT_REASON_LABELS[reason],
      );
    }
    expect(GALLERY_REPORT_REASON_LABELS.this_is_me).toBe("This is me");
  });
});
