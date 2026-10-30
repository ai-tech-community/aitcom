import { expect, it } from "vitest";

import {
  closeIssueDraftWrites,
  ISSUE_WAITING_MESSAGE,
  isStalePublishedIssueDraft,
  issueReviewHold,
} from "./article-review-lock";

it("blocks only while the live issue is still unpublished", () => {
  expect(issueReviewHold({ pending: true, issueStatus: "draft" })).toEqual({
    blocked: true,
    message: ISSUE_WAITING_MESSAGE,
  });
  expect(
    issueReviewHold({ pending: true, issueStatus: "scheduled" }).blocked,
  ).toBe(true);
  expect(issueReviewHold({ pending: true, issueStatus: "published" })).toEqual({
    blocked: false,
  });
  expect(issueReviewHold({ pending: false, issueStatus: "draft" })).toEqual({
    blocked: false,
  });
  expect(ISSUE_WAITING_MESSAGE).toMatch(/approve or reject/);
});

it("treats a pending review of a published issue as stale", () => {
  expect(
    isStalePublishedIssueDraft({
      type: "magazine_issue",
      draftStatus: "pending",
      issueStatus: "published",
    }),
  ).toBe(true);
  expect(
    isStalePublishedIssueDraft({
      type: "magazine_issue",
      draftStatus: "pending",
      issueStatus: "draft",
    }),
  ).toBe(false);
  expect(
    isStalePublishedIssueDraft({
      type: "magazine_article",
      draftStatus: "pending",
      issueStatus: "published",
    }),
  ).toBe(false);
});

it("keeps the cleanup script on a dry run unless --write is passed", () => {
  expect(closeIssueDraftWrites([])).toBe(false);
  expect(closeIssueDraftWrites(["--dry-run"])).toBe(false);
  expect(closeIssueDraftWrites(["--write"])).toBe(true);
});
