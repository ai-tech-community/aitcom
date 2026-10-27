import { TRPCError } from "@trpc/server";

/**
 * Every refusal the magazine services can answer. The message of the
 * TRPCError is the code itself; the client maps it to friendly text through
 * one map per next-intl namespace, so raw messages never reach a toast.
 */
export const MAGAZINE_ERROR_CODES = [
  "CONFIRM_UNLISTED_PUBLIC",
  "MAGAZINE_EXISTS",
  "MAGAZINE_SLUG_TAKEN",
  "SPACE_SLUG_TAKEN",
  "ISSUE_CHANGED",
  "ISSUE_SLUG_TAKEN",
  "ISSUE_SLUG_LOCKED",
  "ISSUE_EMPTY",
  "ISSUE_NOT_DRAFT",
  "SCHEDULE_IN_PAST",
  "SCHEDULE_TOO_FAR",
  "ISSUE_NOT_SCHEDULED",
  "ITEM_INVALID",
  "ARTICLE_PLACED",
  "ARTICLE_NOT_READY",
  "ARTICLE_MAGAZINE_LOCKED",
  "STAFF_NOT_MEMBER",
  "STAFF_LEADS_COMMUNITY",
  "ARTICLE_LOCKED",
  "ARTICLE_NOT_PENDING",
  "REVIEW_NOTE_REQUIRED",
  "UNLISTED_PUBLIC_LEADERS_ONLY",
] as const;

export type MagazineErrorCode = (typeof MAGAZINE_ERROR_CODES)[number];

type TrpcCode = TRPCError["code"];

/**
 * Default transport code per refusal: CONFLICT when the request clashes with
 * data someone else holds or changed (a taken slug, a stale save, a placed
 * article); BAD_REQUEST when the request itself cannot be accepted.
 */
const DEFAULT_TRPC_CODE: Record<MagazineErrorCode, TrpcCode> = {
  CONFIRM_UNLISTED_PUBLIC: "BAD_REQUEST",
  MAGAZINE_EXISTS: "CONFLICT",
  MAGAZINE_SLUG_TAKEN: "CONFLICT",
  SPACE_SLUG_TAKEN: "CONFLICT",
  ISSUE_CHANGED: "CONFLICT",
  ISSUE_SLUG_TAKEN: "CONFLICT",
  ISSUE_SLUG_LOCKED: "BAD_REQUEST",
  ISSUE_EMPTY: "BAD_REQUEST",
  ISSUE_NOT_DRAFT: "CONFLICT",
  SCHEDULE_IN_PAST: "BAD_REQUEST",
  SCHEDULE_TOO_FAR: "BAD_REQUEST",
  ISSUE_NOT_SCHEDULED: "CONFLICT",
  ITEM_INVALID: "BAD_REQUEST",
  ARTICLE_PLACED: "CONFLICT",
  ARTICLE_NOT_READY: "BAD_REQUEST",
  ARTICLE_MAGAZINE_LOCKED: "BAD_REQUEST",
  STAFF_NOT_MEMBER: "BAD_REQUEST",
  STAFF_LEADS_COMMUNITY: "BAD_REQUEST",
  ARTICLE_LOCKED: "CONFLICT",
  ARTICLE_NOT_PENDING: "CONFLICT",
  REVIEW_NOTE_REQUIRED: "BAD_REQUEST",
  UNLISTED_PUBLIC_LEADERS_ONLY: "FORBIDDEN",
};

/**
 * The structured detail of a magazine refusal, carried as the TRPCError's
 * `cause` so the tRPC errorFormatter can expose it as `data`.
 */
export class MagazineErrorCause extends Error {
  readonly itemIndex: number | null;

  constructor(code: MagazineErrorCode, itemIndex: number | null) {
    super(code);
    this.name = "MagazineErrorCause";
    this.itemIndex = itemIndex;
  }
}

export function magazineError(
  code: MagazineErrorCode,
  opts: { trpcCode?: TrpcCode; itemIndex?: number } = {},
): TRPCError {
  return new TRPCError({
    code: opts.trpcCode ?? DEFAULT_TRPC_CODE[code],
    message: code,
    cause: new MagazineErrorCause(code, opts.itemIndex ?? null),
  });
}

/** The issue item a refusal points at, or null. Read by the errorFormatter. */
export function magazineErrorItemIndex(error: TRPCError): number | null {
  return error.cause instanceof MagazineErrorCause
    ? error.cause.itemIndex
    : null;
}
