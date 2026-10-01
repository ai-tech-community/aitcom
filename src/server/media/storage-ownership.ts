/**
 * Every environment (production, previews, a developer's `.env.dev`) talks
 * to the same S3 bucket, but each has its own database. Deleting a file
 * because *its own* database has no record of it (a reachability sweep) is
 * therefore only safe where that database is the complete record of what
 * the bucket holds: production. Anywhere else such a sweep would delete
 * production's files.
 *
 * Deletions of keys a database does know about (a post's own video, an
 * abandoned upload's own files) are not affected.
 */
export function ownsStorageContents(
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return vercelEnv === "production";
}
