import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, user } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { isNewsStaffRole } from "./rumor-rules";
import {
  STORYLINE_DRAFT_NOTIFICATION,
  storylineDraftNotificationCopy,
  storylineDraftReviewUrl,
  storylineReviewRecipients,
  type StorylineMailEnv,
} from "@/lib/news/storyline-draft-review";

export async function listNewsEditorContacts(): Promise<
  Array<{ email: string; userId: string | null }>
> {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "users",
    where: {
      or: [{ role: { equals: "admin" } }, { role: { equals: "editor" } }],
    },
    limit: 200,
    depth: 0,
  });
  const emails = [
    ...new Set(
      docs.flatMap((doc) => {
        const email = String(doc.email ?? "")
          .trim()
          .toLowerCase();
        const role = typeof doc.role === "string" ? doc.role : null;
        return email.includes("@") && isNewsStaffRole(role) ? [email] : [];
      }),
    ),
  ];
  if (!emails.length) return [];
  const members = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      sql`lower(${user.email}) in (${sql.join(
        emails.map((email) => sql`${email}`),
        sql`, `,
      )})`,
    );
  const byEmail = new Map(
    members.map((member) => [member.email.trim().toLowerCase(), member.id]),
  );
  return emails.map((email) => ({
    email,
    userId: byEmail.get(email) ?? null,
  }));
}

function reviewOrigin(
  env: StorylineMailEnv & { NEXT_PUBLIC_APP_URL?: string },
) {
  if (env.VERCEL_ENV === "production" && env.NODE_ENV === "production") {
    return CANONICAL_PRODUCTION_ORIGIN;
  }
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * Bell notification plus email for the owner and news editors.
 * Failures are logged by the caller; this function still isolates each send.
 */
export async function notifyStorylineDraftReview(
  input: { draftId: string; ownerId: string; title: string },
  env: StorylineMailEnv & { NEXT_PUBLIC_APP_URL?: string } = process.env,
): Promise<void> {
  const [owner] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, input.ownerId))
    .limit(1);
  let editors: Array<{ email: string; userId: string | null }> = [];
  try {
    editors = await listNewsEditorContacts();
  } catch (err) {
    console.error("news: could not list editors for a storyline draft", err);
  }
  const recipients = storylineReviewRecipients({
    owner: {
      userId: input.ownerId,
      email: owner?.email ?? "",
    },
    editors,
  });
  const copy = storylineDraftNotificationCopy(input.title);
  const reviewPath = `/news/stories/drafts/${encodeURIComponent(input.draftId)}`;
  const inApp = recipients.flatMap((recipient) =>
    recipient.userId
      ? [
          {
            userId: recipient.userId,
            type: STORYLINE_DRAFT_NOTIFICATION,
            title: copy.title,
            content: copy.content,
            metadata: {
              reviewPath,
              linkLabel: copy.linkLabel,
              draftId: input.draftId,
            },
          },
        ]
      : [],
  );
  if (inApp.length) await db.insert(notifications).values(inApp);

  const { sendStorylineDraftReviewEmail } = await import("@/server/email");
  const reviewUrl = storylineDraftReviewUrl(input.draftId, reviewOrigin(env));
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    try {
      await sendStorylineDraftReviewEmail(
        recipient.email,
        { title: input.title, reviewUrl },
        env,
      );
    } catch (err) {
      console.error("news: storyline draft email failed", err);
    }
  }
}
