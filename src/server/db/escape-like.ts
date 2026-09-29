/** Escape SQL LIKE/ILIKE pattern characters, so user text matches literally. */
export function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}
