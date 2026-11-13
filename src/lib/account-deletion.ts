/** Typed in the settings dialog. The same token in en, nl, and fr. */
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

/**
 * Replaces author ids on Payload content (plain text, no foreign key) so a
 * post no longer points at the member. Not a user id. Here, not in the
 * server's account deletion, so readers of that content can recognise it
 * without importing the deletion's database code.
 */
export const DELETED_AUTHOR_ID = "deleted-member";
