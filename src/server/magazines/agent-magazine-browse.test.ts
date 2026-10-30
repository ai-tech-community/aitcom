import { describe, expect, it } from "vitest";

import {
  mergeCommunityMagazineBrowse,
  submissionsAreVisible,
} from "./agent-magazine-browse";

describe("submissionsVisible", () => {
  it("follows standing and ignores how many submission rows a query returned", () => {
    expect(submissionsAreVisible(true, "owner")).toBe(true);
    expect(submissionsAreVisible(false, "owner")).toBe(true);
    expect(submissionsAreVisible(true, null)).toBe(true);
    expect(submissionsAreVisible(false, null)).toBe(false);
  });
});

describe("community magazine browse", () => {
  it("returns every magazine's issues when the caller named only the community", () => {
    const merged = mergeCommunityMagazineBrowse({
      magazines: [
        { id: 2, slug: "beta" },
        { id: 1, slug: "alpha" },
      ],
      details: [
        {
          issues: [{ id: 9, number: 1 }],
          articles: [{ id: 50 }],
          submissions: [],
        },
        {
          issues: [
            { id: 4, number: 2 },
            { id: 3, number: 2 },
          ],
          articles: [{ id: 50 }, { id: 8 }],
          submissions: [{ id: 8 }],
        },
      ],
      page: 1,
      yourDrafts: [{ magazineSlug: "alpha" }, { magazineSlug: "other" }],
      submissionsVisible: true,
    });
    expect(merged.issues.map((issue) => issue.id)).toEqual([3, 4, 9]);
    expect(merged.articles.map((article) => article.id)).toEqual([8, 50]);
    expect(merged.submissions.map((item) => item.id)).toEqual([8]);
    expect(merged.submissionsVisible).toBe(true);
    expect(merged.yourDrafts).toEqual([{ magazineSlug: "alpha" }]);
  });

  it("keeps submissionsVisible when the submission list is empty", () => {
    const merged = mergeCommunityMagazineBrowse({
      magazines: [{ id: 1, slug: "alpha" }],
      details: [
        { issues: [{ id: 4, number: 1 }], articles: [], submissions: [] },
      ],
      page: 1,
      yourDrafts: [],
      submissionsVisible: true,
    });
    expect(merged.submissions).toEqual([]);
    expect(merged.submissionsVisible).toBe(true);
    expect(merged.issues).toEqual([{ id: 4, number: 1 }]);
  });
});
