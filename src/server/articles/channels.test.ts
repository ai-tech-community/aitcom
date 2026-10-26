// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  assertMagazineUnchanged,
  blogChannel,
  channelFor,
  magazineChannel,
  type ArticleData,
} from "./channels";

describe("blog channel (today's review behaviour)", () => {
  it("blog approval publishes and stamps publishedAt", () => {
    const data: ArticleData = {
      authorType: "member",
      reviewStatus: "approved",
      status: "draft",
    };
    blogChannel.onReviewChange(data, { reviewStatus: "pending_review" });
    expect(data.status).toBe("published");
    expect(typeof data.publishedAt).toBe("string");
    expect(Number.isNaN(Date.parse(data.publishedAt!))).toBe(false);
  });

  it("blog approval keeps a publishedAt the update already carries", () => {
    const data: ArticleData = {
      reviewStatus: "approved",
      publishedAt: "2026-01-01T00:00:00.000Z",
    };
    blogChannel.onReviewChange(data, { reviewStatus: "pending_review" });
    expect(data.publishedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("blog re-saving an approved article changes nothing", () => {
    const data: ArticleData = { reviewStatus: "approved", status: "draft" };
    blogChannel.onReviewChange(data, { reviewStatus: "approved" });
    expect(data).toEqual({ reviewStatus: "approved", status: "draft" });
  });

  it("blog pending_review moves to draft", () => {
    const data: ArticleData = {
      reviewStatus: "pending_review",
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    };
    blogChannel.onReviewChange(data, { reviewStatus: null });
    expect(data.status).toBe("draft");
    expect(data.publishedAt).toBeNull();
  });

  it.each(["rejected", "changes_requested"])(
    "blog %s moves to draft on the transition only",
    (reviewStatus) => {
      const data: ArticleData = { reviewStatus, status: "published" };
      blogChannel.onReviewChange(data, { reviewStatus: "approved" });
      expect(data.status).toBe("draft");
      expect(data.publishedAt).toBeNull();

      const again: ArticleData = { reviewStatus, status: "published" };
      blogChannel.onReviewChange(again, { reviewStatus });
      expect(again).toEqual({ reviewStatus, status: "published" });
    },
  );

  it("an approval saved over a member blog article publishes it", () => {
    // The shape the Articles hook receives: Payload has already filled the
    // fields the update left out from the saved doc.
    const originalDoc: ArticleData = {
      authorType: "member",
      reviewStatus: "pending_review",
      status: "draft",
      publishedAt: null,
      magazine: null,
    };
    const data: ArticleData = { ...originalDoc, reviewStatus: "approved" };
    channelFor(data).onReviewChange(data, originalDoc);
    expect(data.status).toBe("published");
    expect(typeof data.publishedAt).toBe("string");
  });
});

describe("magazine channel", () => {
  it("magazine approval leaves status and publishedAt alone", () => {
    const data: ArticleData = { reviewStatus: "approved", status: "draft" };
    magazineChannel.onReviewChange(data, { reviewStatus: "pending_review" });
    expect(data.status).toBe("draft");
    expect(data.publishedAt).toBeUndefined();
  });

  it("only the blog credits on approval", () => {
    expect(magazineChannel.creditsOnApproval).toBe(false);
    expect(blogChannel.creditsOnApproval).toBe(true);
  });

  it("magazine changes_requested sends a draft back to draft", () => {
    const data: ArticleData = {
      reviewStatus: "changes_requested",
      status: "draft",
    };
    magazineChannel.onReviewChange(data, { reviewStatus: "approved" });
    expect(data.status).toBe("draft");
    expect(data.publishedAt).toBeNull();
  });

  it("magazine rejected sends the article to draft", () => {
    const data: ArticleData = { reviewStatus: "rejected", status: "published" };
    magazineChannel.onReviewChange(data, { reviewStatus: "approved" });
    expect(data.status).toBe("draft");
    expect(data.publishedAt).toBeNull();
  });

  it("names the write policies the routers dispatch on", () => {
    expect(blogChannel.submitPolicy).toBe("staff_review");
    expect(magazineChannel.submitPolicy).toBe("editor_approves");
    expect(blogChannel.publishedEditPolicy).toBe("trusted_author");
    expect(magazineChannel.publishedEditPolicy).toBe("magazine_editor");
  });
});

describe("channelFor", () => {
  it("channelFor reads the magazine relation, populated or as an id", () => {
    expect(channelFor({ magazine: 3 })).toBe(magazineChannel);
    expect(channelFor({ magazine: { id: 3 } })).toBe(magazineChannel);
    expect(channelFor({ magazine: null })).toBe(blogChannel);
    expect(channelFor({})).toBe(blogChannel);
  });
});

describe("assertMagazineUnchanged", () => {
  it("refuses moving an article into, out of, or between magazines", () => {
    expect(() =>
      assertMagazineUnchanged({ magazine: 3 }, { magazine: null }),
    ).toThrow("ARTICLE_MAGAZINE_LOCKED");
    expect(() =>
      assertMagazineUnchanged({ magazine: null }, { magazine: 3 }),
    ).toThrow("ARTICLE_MAGAZINE_LOCKED");
    expect(() =>
      assertMagazineUnchanged({ magazine: 4 }, { magazine: { id: 3 } }),
    ).toThrow("ARTICLE_MAGAZINE_LOCKED");
  });

  it("allows creating with a magazine and saves that keep it", () => {
    expect(() =>
      assertMagazineUnchanged({ magazine: 3 }, undefined),
    ).not.toThrow();
    expect(() =>
      assertMagazineUnchanged({ magazine: { id: 3 } }, { magazine: 3 }),
    ).not.toThrow();
    expect(() =>
      assertMagazineUnchanged({ magazine: null }, { magazine: undefined }),
    ).not.toThrow();
  });
});
