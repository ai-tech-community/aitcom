import { expect, it } from "vitest";

import {
  ARTICLE_BLOCKING_MESSAGE,
  articleReadiness,
  articleReadyStep,
} from "./readiness";

const hashParagraphs = {
  root: {
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            text: "You don't need a course to start, just 20 minutes a day.",
          },
        ],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "## Days 1-7: Sounds" }],
      },
    ],
  },
};

it("does not treat a stored ## paragraph as a heading", () => {
  const report = articleReadiness({
    title: "Your first 30 days of Dutch",
    content: hashParagraphs,
    type: "article",
  });
  expect(report.blocking).toContain("missing_h2");
  expect(report.outline).toEqual([]);
  expect(
    report.blocking.map((code) => ARTICLE_BLOCKING_MESSAGE[code]),
  ).toContain("Add at least one H2 heading");
});

it("asks for an intro when the first node is already a heading", () => {
  const report = articleReadiness({
    title: "Sounds",
    content: {
      root: {
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Days 1-7" }],
          },
        ],
      },
    },
    type: "article",
  });
  expect(report.blocking).toEqual(["missing_intro"]);
  expect(ARTICLE_BLOCKING_MESSAGE.missing_intro).toBe(
    "Add an intro paragraph before first heading",
  );
});

it("does not hand in a failing article, and does not approve one waiting on an editor", () => {
  expect(
    articleReadyStep({
      blocking: ["missing_h2"],
      reviewStatus: null,
      status: "draft",
    }),
  ).toBe("blocked");
  expect(
    articleReadyStep({
      blocking: [],
      reviewStatus: "pending_review",
      status: "draft",
    }),
  ).toBe("awaiting_editor");
  expect(
    articleReadyStep({
      blocking: [],
      reviewStatus: "approved",
      status: "draft",
    }),
  ).toBe("ready");
  expect(
    articleReadyStep({
      blocking: [],
      reviewStatus: "rejected",
      status: "draft",
    }),
  ).toBe("forbidden");
  expect(
    articleReadyStep({
      blocking: [],
      reviewStatus: null,
      status: "draft",
    }),
  ).toBe("submit");
  expect(
    articleReadyStep({
      blocking: [],
      reviewStatus: "changes_requested",
      status: "draft",
    }),
  ).toBe("submit");
});
