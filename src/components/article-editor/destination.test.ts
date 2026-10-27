import { describe, expect, it } from "vitest";

import { destinationBehaviour, type ArticleDestination } from "./destination";

const magazine: ArticleDestination = {
  kind: "magazine",
  magazineId: 42,
  magazineName: "The Gazette",
  communitySlug: "night-owls",
  handIn: "mark_ready",
};

describe("destinationBehaviour", () => {
  it("keeps the blog behaviour", () => {
    const behaviour = destinationBehaviour({ kind: "blog" });
    expect(behaviour).toEqual({
      createExtras: {},
      afterSubmitHref: "/blog/my-articles",
      submitLabelKey: "submitForReview",
      showTrustedPublish: true,
      submittedKey: "submitted",
      prePublishTitleKey: "prePublishTitle",
      prePublishSubtitleKey: "prePublishSubtitle",
      editPath: expect.any(Function),
      errorKey: expect.any(Function),
    });
    expect(behaviour.editPath("my-story-1")).toBe("/blog/edit/my-story-1");
    // The blog shows the server's own text, as before.
    expect(behaviour.errorKey(new Error("Not your article"))).toBeNull();
  });

  it("writes for the magazine: its id on create, mark ready, back to the Magazine tab", () => {
    const behaviour = destinationBehaviour(magazine);
    expect(behaviour).toEqual({
      createExtras: { magazineId: 42 },
      afterSubmitHref: "/communities/night-owls/magazine",
      submitLabelKey: "magazine.markReady",
      showTrustedPublish: false,
      submittedKey: "magazine.markedReady",
      prePublishTitleKey: "magazine.prePublishTitle",
      prePublishSubtitleKey: "magazine.prePublishSubtitle",
      editPath: expect.any(Function),
      errorKey: expect.any(Function),
    });
    expect(behaviour.editPath("my-story-1")).toBe(
      "/communities/night-owls/magazine/articles/my-story-1/edit",
    );
  });

  it("a contributor's magazine destination sends to the editors", () => {
    expect(
      destinationBehaviour({ ...magazine, handIn: "send_for_review" }),
    ).toMatchObject({
      submitLabelKey: "magazine.sendForReview",
      submittedKey: "magazine.sentForReview",
      prePublishTitleKey: "magazine.reviewPrePublishTitle",
      prePublishSubtitleKey: "magazine.reviewPrePublishSubtitle",
      showTrustedPublish: false,
    });
  });

  it("maps magazine refusals to friendly keys, never raw server text", () => {
    const { errorKey } = destinationBehaviour(magazine);
    expect(errorKey(new Error("ARTICLE_MAGAZINE_LOCKED"))).toBe(
      "articleMagazineLocked",
    );
    expect(errorKey(new Error("FORBIDDEN"))).toBe("generic");
    expect(errorKey("boom")).toBe("generic");
  });
});
