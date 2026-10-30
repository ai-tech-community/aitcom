import { expect, it, vi } from "vitest";

import type { Deps } from "../deps";
import { loadIssueAccessById } from "../issue-access";
import { recordReadFor } from "./record";

vi.mock("../issue-access", () => ({ loadIssueAccessById: vi.fn() }));

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
