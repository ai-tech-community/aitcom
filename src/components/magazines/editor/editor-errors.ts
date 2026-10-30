import type { MagazineErrorCode } from "@/server/magazines/errors";

/**
 * Magazine refusal codes → keys under `magazineEditor.errors`. The server
 * sends the code as the error message (`magazineError`); raw server text
 * never reaches the UI, and anything unknown maps to `generic`. The
 * `Record` makes a new `MagazineErrorCode` a compile error here until it
 * has its own friendly text.
 */
const KEYS = {
  CONFIRM_UNLISTED_PUBLIC: "confirmUnlistedPublic",
  MAGAZINE_EXISTS: "magazineExists",
  MAGAZINE_PUBLISHED: "magazinePublished",
  MAGAZINE_SLUG_TAKEN: "magazineSlugTaken",
  SPACE_SLUG_TAKEN: "spaceSlugTaken",
  ISSUE_CHANGED: "issueChanged",
  ISSUE_SLUG_TAKEN: "issueSlugTaken",
  ISSUE_SLUG_LOCKED: "issueSlugLocked",
  ISSUE_EMPTY: "issueEmpty",
  ISSUE_NOT_DRAFT: "issueNotDraft",
  SCHEDULE_IN_PAST: "scheduleInPast",
  SCHEDULE_TOO_FAR: "scheduleTooFar",
  ISSUE_NOT_SCHEDULED: "issueNotScheduled",
  ITEM_INVALID: "itemInvalid",
  ARTICLE_PLACED: "articlePlaced",
  ARTICLE_NOT_READY: "articleNotReady",
  ARTICLE_MAGAZINE_LOCKED: "articleMagazineLocked",
  STAFF_NOT_MEMBER: "staffNotMember",
  STAFF_LEADS_COMMUNITY: "staffLeadsCommunity",
  ARTICLE_LOCKED: "articleLocked",
  ARTICLE_NOT_PENDING: "articleNotPending",
  REVIEW_NOTE_REQUIRED: "reviewNoteRequired",
  UNLISTED_PUBLIC_LEADERS_ONLY: "unlistedPublicLeadersOnly",
  THEME_INVALID: "themeInvalid",
} as const satisfies Record<MagazineErrorCode, string>;

/** A key under `magazineEditor.errors`. */
export type EditorErrorKey = (typeof KEYS)[MagazineErrorCode] | "generic";

function isMagazineErrorCode(code: string): code is MagazineErrorCode {
  // Own keys only, so "toString" / "constructor" never resolve to prototype members.
  return Object.hasOwn(KEYS, code);
}

export function editorErrorKey(code: string | undefined): EditorErrorKey {
  return code && isMagazineErrorCode(code) ? KEYS[code] : "generic";
}

/** The parts of a tRPC client error the editor reads. */
type EditorErrorLike = {
  message?: string;
  data?: { magazineItemIndex?: number | null } | null;
};

/**
 * A failed magazine call as the editor shows it: the friendly message key
 * and, for refusals about one issue item, the index of that item (the
 * errorFormatter's `data.magazineItemIndex`), so the builder can point at
 * the row.
 */
export function readEditorError(error: unknown): {
  key: EditorErrorKey;
  itemIndex: number | null;
} {
  const e = (
    typeof error === "object" && error !== null ? error : {}
  ) as EditorErrorLike;
  const itemIndex = e.data?.magazineItemIndex;
  return {
    key: editorErrorKey(typeof e.message === "string" ? e.message : undefined),
    itemIndex: typeof itemIndex === "number" ? itemIndex : null,
  };
}
