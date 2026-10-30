import { describe, expect, it } from "vitest";

import { planIssueEdit } from "./issue-edit-plan";

const base = {
  ownDraftStatus: null as string | null,
  issueStatus: "published" as const,
  canEdit: true,
  changesItems: false,
  changesCoverOrMetadata: true,
};

describe("published issue edits", () => {
  it("lets a magazine editor propose a cover or details change for the owner", () => {
    expect(planIssueEdit(base)).toEqual({
      ok: true,
      action: "propose-published",
    });
  });

  it("still writes an agent's own open draft directly", () => {
    expect(
      planIssueEdit({
        ...base,
        ownDraftStatus: "draft",
        issueStatus: "draft",
      }),
    ).toEqual({ ok: true, action: "write-draft" });
  });

  it("explains that a non-editor cannot change a published issue", () => {
    const plan = planIssueEdit({ ...base, canEdit: false });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.code).toBe("FORBIDDEN");
      expect(plan.message).toMatch(/magazine editor/);
      expect(plan.message).toMatch(/owner approves/);
      expect(plan.message).not.toBe(
        "You can only edit your own open issue draft.",
      );
    }
  });

  it("refuses section changes on a published issue", () => {
    const plan = planIssueEdit({ ...base, changesItems: true });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.message).toMatch(/cover and details/);
      expect(plan.message).toMatch(/open draft/);
    }
  });

  it("explains a scheduled issue and a review that is already waiting", () => {
    const scheduled = planIssueEdit({
      ...base,
      issueStatus: "scheduled",
    });
    expect(scheduled.ok).toBe(false);
    if (!scheduled.ok) expect(scheduled.message).toMatch(/scheduled/);

    const pending = planIssueEdit({
      ...base,
      ownDraftStatus: "pending",
      issueStatus: "draft",
      canEdit: false,
    });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.message).toMatch(/already in review/);
  });
});
