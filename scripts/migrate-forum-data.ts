/**
 * Migration script — run with:
 *   pnpm payload run scripts/migrate-forum-data.ts
 *
 * Backfills new fields on existing forum threads and replies:
 *   - forum-threads: viewCount, authorRole, lastActivityAt
 *   - forum-replies: authorRole
 */
import { getPayload } from "payload";
import config from "@payload-config";

const payload = await getPayload({ config });

// ── Migrate forum threads ────────────────────────────────────────────────

console.log("Migrating forum threads...");

const threads = await payload.find({
  collection: "forum-threads",
  limit: 1000,
  depth: 0,
});

let threadUpdates = 0;
for (const thread of threads.docs) {
  const updates: Record<string, unknown> = {};

  if (thread.viewCount == null) updates.viewCount = 0;
  if (!thread.authorRole) updates.authorRole = "member";
  if (!thread.lastActivityAt) {
    updates.lastActivityAt = thread.updatedAt ?? thread.createdAt;
  }

  if (Object.keys(updates).length > 0) {
    await payload.update({
      collection: "forum-threads",
      id: thread.id,
      data: updates,
    });
    threadUpdates++;
    console.log(`  Updated thread ${thread.id}: ${thread.title}`);
  }
}
console.log(`Updated ${threadUpdates}/${threads.docs.length} threads`);

// ── Migrate forum replies ────────────────────────────────────────────────

console.log("Migrating forum replies...");

const replies = await payload.find({
  collection: "forum-replies",
  limit: 10000,
  depth: 0,
});

let replyUpdates = 0;
for (const reply of replies.docs) {
  if (!reply.authorRole) {
    await payload.update({
      collection: "forum-replies",
      id: reply.id,
      data: { authorRole: "member" },
    });
    replyUpdates++;
  }
}
console.log(`Updated ${replyUpdates}/${replies.docs.length} replies`);

console.log("Migration complete!");
process.exit(0);
