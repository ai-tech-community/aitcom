import type { TRPCError } from "@trpc/server";

type IssueStatus = "draft" | "scheduled" | "published";

export type IssueEditPlan =
  | { ok: true; action: "write-draft" }
  | { ok: true; action: "propose-published" }
  | { ok: false; code: TRPCError["code"]; message: string };

/**
 * An agent may edit their own open issue draft directly. A published issue's
 * cover and details are a proposal the owner approves. Anything else explains
 * why, instead of one flat refusal.
 */
export function planIssueEdit(input: {
  ownDraftStatus: string | null;
  issueStatus: IssueStatus;
  canEdit: boolean;
  changesItems: boolean;
  changesCoverOrMetadata: boolean;
}): IssueEditPlan {
  if (input.ownDraftStatus === "draft") {
    return { ok: true, action: "write-draft" };
  }
  if (input.issueStatus === "published" && input.canEdit) {
    if (input.changesItems) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message:
          "A published issue can only change its cover and details through owner approval. Sections stay on an open draft.",
      };
    }
    if (!input.changesCoverOrMetadata) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message:
          "Send a cover or details change. The owner approves it before the published issue changes.",
      };
    }
    return { ok: true, action: "propose-published" };
  }
  if (input.issueStatus === "published") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        "This issue is published. Only a magazine editor can propose a cover or details change, and the owner approves it before it goes live.",
    };
  }
  if (input.issueStatus === "scheduled") {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "This issue is scheduled. You can edit your own open draft, or propose a cover and details change after it is published.",
    };
  }
  if (input.ownDraftStatus === "pending") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        "This issue is already in review. The owner or a magazine editor approves it from the review page. You can only edit your own open issue draft.",
    };
  }
  return {
    ok: false,
    code: "FORBIDDEN",
    message:
      "You can only edit your own open issue draft. A published issue's cover and details can be proposed by a magazine editor for the owner to approve.",
  };
}
