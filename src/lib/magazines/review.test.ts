import { describe, expect, it } from "vitest";

import {
  REVIEW_DECISIONS,
  REVIEW_NOTE_MAX,
  WRITER_REVIEW_STATUSES,
  isOpenForWriter,
  mayWriterChange,
  reviewStatusFor,
  writerStatusOf,
} from "./review";

describe("magazine review", () => {
  it("maps decisions to review statuses", () => {
    expect(REVIEW_DECISIONS.map(reviewStatusFor)).toEqual([
      "approved",
      "changes_requested",
      "rejected",
    ]);
    expect(REVIEW_NOTE_MAX).toBe(2000);
  });

  it("keeps an article open only before it is sent, or after changes were requested", () => {
    for (const article of [
      { status: "draft", reviewStatus: null },
      { status: "draft", reviewStatus: "changes_requested" },
      { status: "draft" },
      {},
    ]) {
      expect(isOpenForWriter(article)).toBe(true);
    }
    for (const article of [
      { status: "draft", reviewStatus: "pending_review" },
      { status: "draft", reviewStatus: "approved" },
      { status: "draft", reviewStatus: "rejected" },
      { status: "draft", reviewStatus: "weird" },
      { status: "published", reviewStatus: "changes_requested" },
      { status: "published", reviewStatus: null },
    ]) {
      expect(isOpenForWriter(article)).toBe(false);
    }
  });

  it("lets a writer with edit change anything, a contributor only open articles", () => {
    for (const reviewStatus of ["pending_review", "approved", "rejected"]) {
      const article = { status: "draft", reviewStatus };
      expect(mayWriterChange(true, article)).toBe(true);
      expect(mayWriterChange(false, article)).toBe(false);
    }
    expect(
      mayWriterChange(false, {
        status: "draft",
        reviewStatus: "changes_requested",
      }),
    ).toBe(true);
    expect(mayWriterChange(false, { status: "draft" })).toBe(true);
    expect(mayWriterChange(true, { status: "published" })).toBe(true);
    expect(mayWriterChange(false, { status: "published" })).toBe(false);
  });

  it("names each writer status", () => {
    expect(writerStatusOf(null)).toBe("draft");
    expect(writerStatusOf("approved")).toBe("approved");
    expect(writerStatusOf("weird")).toBe("draft");
    expect(WRITER_REVIEW_STATUSES.map(writerStatusOf)).toEqual([
      "pending_review",
      "changes_requested",
      "rejected",
      "approved",
    ]);
  });
});
