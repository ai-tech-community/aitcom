"use client";

import { useCallback, useRef } from "react";

import {
  type AutosaveStatus,
  useAutosave,
  type UseAutosaveResult,
} from "@/components/use-autosave";
import type { VersionedWriter } from "@/components/versioned-writer";
import type { EditorItemView } from "@/lib/magazines/item-views";
import type { IssueVisibility } from "@/lib/magazines/values";
import { shouldWithdrawVisibilityConfirmation } from "@/lib/magazines/visibility";
import type { MagazineIssue } from "@/payload-types";
import { api } from "@/trpc/react";

import { type BuilderItem, toItemInputs } from "./items-model";

/** The issue's own fields as the builder edits them. */
export type IssueDetailsDraft = {
  title: string;
  slug: string;
  coverImageUrl: string | null;
  editorNote: unknown;
  visibility: IssueVisibility;
};

/**
 * The issue's details as they are saved. Besides the edited fields, a save
 * carries whether the issue's outsider visibility holds the editor's
 * unlisted-community opt-in (ADR-0042). It is part of the value, not a side
 * flag, because ticking the box must save even when the visibility itself
 * does not change: an issue already open to outsiders without a confirmation
 * (its community became unlisted later) is confirmed by the tick alone.
 */
export type IssueDetailsSave = IssueDetailsDraft & {
  /**
   * An outsider choice in a private community, with the opt-in recorded on the
   * server or given by the editor. Always false in a public community.
   */
  publicConfirmed: boolean;
};

/** Everything the builder saves: one value, one autosave (preflight F3). */
export type IssueSaveValue = {
  details: IssueDetailsSave;
  items: BuilderItem[];
};

/** A refused save: the server code and the builder item it points at. */
export type IssueSaveFailure = { error: unknown; itemKey: string | null };

/** The issue builder's conflict code: someone else saved the issue first. */
export const ISSUE_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "ISSUE_CHANGED",
]);

/**
 * Whether a refused write is the issue's conflict, by the same codes the
 * autosave reads (an Error whose message is the code).
 */
export function isIssueConflict(error: unknown): boolean {
  return error instanceof Error && ISSUE_CONFLICT_CODES.has(error.message);
}

const jsonEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * `updateIssue`'s patch: only the fields that changed since the last save.
 * A new opt-in sends the visibility with `confirmUnlistedPublic`, including
 * when widening a confirmed preview to everyone. The server records the
 * confirmation only as part of a visibility write.
 */
function detailsPatch(next: IssueDetailsSave, saved: IssueDetailsSave) {
  const confirming =
    next.publicConfirmed &&
    (!saved.publicConfirmed ||
      shouldWithdrawVisibilityConfirmation(saved.visibility, next.visibility));
  return {
    ...(next.title !== saved.title ? { title: next.title } : {}),
    ...(next.slug !== saved.slug ? { issueSlug: next.slug } : {}),
    ...(next.coverImageUrl !== saved.coverImageUrl
      ? { coverImageUrl: next.coverImageUrl }
      : {}),
    ...(!jsonEqual(next.editorNote, saved.editorNote)
      ? { editorNote: next.editorNote }
      : {}),
    ...(next.visibility !== saved.visibility || confirming
      ? { visibility: next.visibility }
      : {}),
    ...(confirming ? { confirmUnlistedPublic: true } : {}),
  };
}

/**
 * The issue builder's one save model. The issue's details and its items
 * autosave as ONE value through ONE queue (`useAutosave`), and every write
 * — details, items and the publish action (via `writer`) — goes through
 * the same versioned writer, so each request carries the `updatedAt` the
 * previous one returned and the builder never conflicts with itself
 * (preflight F3). A save sends only the part that changed: details through
 * `updateIssue`, items through `setIssueItems`.
 *
 * `value` must be savable as it is: the caller leaves out what the server
 * would refuse (a blank title, an unfinished block, a public choice that
 * still needs the opt-in) and keeps it as unsaved work. The opt-in itself
 * travels in `value.details.publicConfirmed`.
 */
export function useIssueSave({
  communitySlug,
  issueId,
  writer,
  initial,
  value,
  enabled,
  onDetailsSaved,
  onItemsSaved,
  onFailed,
}: {
  communitySlug: string;
  issueId: number;
  writer: VersionedWriter;
  /** The value the issue was loaded with: the baseline, never saved. */
  initial: IssueSaveValue;
  value: IssueSaveValue;
  enabled: boolean;
  onDetailsSaved: (issue: MagazineIssue) => void;
  /** The saved issue and its items as views, by builder key. */
  onItemsSaved: (saved: {
    issue: MagazineIssue;
    viewsByKey: Map<string, EditorItemView>;
  }) => void;
  /** Every refused save, conflicts included; null once a save succeeds. */
  onFailed: (failure: IssueSaveFailure | null) => void;
}): UseAutosaveResult & {
  /** The builder key of the item at a position in the last saved list. */
  savedItemKeyAt: (index: number) => string | null;
} {
  const updateIssue = api.magazines.updateIssue.useMutation();
  const setIssueItems = api.magazines.setIssueItems.useMutation();
  const { mutateAsync: saveDetails } = updateIssue;
  const { mutateAsync: saveItems } = setIssueItems;

  // What the server holds, part by part, so a save sends only what changed
  // and a retry after a half-done save does not resend the done half.
  const savedRef = useRef<IssueSaveValue>(initial);
  // Block ids the server gave items added in this session, by builder key.
  const blockIdsRef = useRef(new Map<string, string>());

  const save = useCallback(
    async (next: IssueSaveValue) => {
      try {
        if (!jsonEqual(next.details, savedRef.current.details)) {
          const patch = detailsPatch(next.details, savedRef.current.details);
          await writer.run(async (expectedUpdatedAt) => {
            const issue = await saveDetails({
              slug: communitySlug,
              issueId,
              expectedUpdatedAt,
              ...patch,
            });
            onDetailsSaved(issue);
            return issue.updatedAt;
          });
          savedRef.current = { ...savedRef.current, details: next.details };
        }
        if (!jsonEqual(next.items, savedRef.current.items)) {
          await writer.run(async (expectedUpdatedAt) => {
            const saved = await saveItems({
              slug: communitySlug,
              issueId,
              expectedUpdatedAt,
              items: toItemInputs(next.items, blockIdsRef.current),
            });
            const blocks = saved.issue.items ?? [];
            const viewsByKey = new Map<string, EditorItemView>();
            next.items.forEach((item, index) => {
              const blockId = blocks[index]?.id;
              if (blockId) blockIdsRef.current.set(item.key, blockId);
              const view = saved.items[index];
              if (view) viewsByKey.set(item.key, view);
            });
            onItemsSaved({ issue: saved.issue, viewsByKey });
            return saved.issue.updatedAt;
          });
          savedRef.current = { ...savedRef.current, items: next.items };
        }
      } catch (error) {
        const index = (
          error as { data?: { magazineItemIndex?: number | null } } | null
        )?.data?.magazineItemIndex;
        onFailed({
          error,
          itemKey:
            typeof index === "number" ? (next.items[index]?.key ?? null) : null,
        });
        throw error;
      }
      onFailed(null);
    },
    [
      writer,
      saveDetails,
      saveItems,
      communitySlug,
      issueId,
      onDetailsSaved,
      onItemsSaved,
      onFailed,
    ],
  );

  const autosave = useAutosave({
    value,
    save,
    conflictCodes: ISSUE_CONFLICT_CODES,
    enabled,
  });

  const savedItemKeyAt = useCallback(
    (index: number) => savedRef.current.items[index]?.key ?? null,
    [],
  );

  return { ...autosave, savedItemKeyAt };
}

/** Whether the builder holds work the server does not have yet. */
export function hasUnsavedWork(status: AutosaveStatus, paused: boolean) {
  return (
    paused ||
    status === "dirty" ||
    status === "saving" ||
    status === "error" ||
    status === "conflict"
  );
}
