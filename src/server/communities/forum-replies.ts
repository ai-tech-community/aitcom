import { plainTextToLexical } from "@/server/challenge-engine/lexical";

/**
 * What a soft-deleted reply keeps as its `content`. The reply's words are
 * removed, but `content` is a required field, so an empty document fails
 * validation and the delete with it. Readers show their own "deleted"
 * message from `isDeleted`; this marker is for anything reading raw rows.
 */
export const DELETED_REPLY_CONTENT = plainTextToLexical("[deleted]");
