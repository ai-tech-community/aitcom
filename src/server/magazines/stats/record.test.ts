import { beforeEach, expect, it, vi } from "vitest";

import type { Deps } from "../deps";
import { loadIssueAccessById } from "../issue-access";
import { recordReadFor } from "./record";
import { recordMagazineRead } from "./reads";

vi.mock("../issue-access", () => ({ loadIssueAccessById: vi.fn() }));
vi.mock("./reads", () => ({ recordMagazineRead: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("refuses read-to-end without an article before loading access", async () => {
  expect(
    await recordReadFor({} as Deps, {
      issueId: 1,
      articleId: null,
      event: "read_end",
      viewerId: null,
      readerKey: "unused",
      now: new Date(),
    }),
  ).toBe(false);
  expect(loadIssueAccessById).not.toHaveBeenCalled();
});

it("preserves teaser opening tallies and refuses teaser completion after sharing the page gate", async () => {
  vi.mocked(loadIssueAccessById).mockResolvedValue({
    access: "teaser",
    issue: { id: 1, magazineId: 12 },
  } as never);
  const input = {
    issueId: 1,
    articleId: null,
    viewerId: null,
    readerKey: "a123",
    now: new Date(),
  };
  expect(await recordReadFor({} as Deps, { ...input, event: "view" })).toBe(
    true,
  );
  expect(recordMagazineRead).toHaveBeenCalledWith(undefined, {
    magazineId: 12,
    issueId: 1,
    articleId: null,
    readerKey: "a123",
    now: input.now,
    event: "view",
  });
  expect(
    await recordReadFor({} as Deps, {
      ...input,
      articleId: 3,
      event: "read_end",
    }),
  ).toBe(false);
  expect(recordMagazineRead).toHaveBeenCalledOnce();
});
