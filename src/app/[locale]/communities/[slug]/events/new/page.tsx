import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EventEditor } from "@/components/events/editor/event-editor";
import { EventEditorShell } from "@/components/events/editor/event-editor-shell";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { resolveEditorAccess } from "@/server/events/event-editor-access";

/** Create (admins) or submit (members) a community event. */
export default async function NewCommunityEventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const session = await getSession();
  if (!session?.user) {
    const here = `/${locale}/communities/${slug}/events/new`;
    redirect(`/${locale}/auth/signin?redirect=${encodeURIComponent(here)}`);
  }
  const access = await resolveEditorAccess(db, session.user.id, slug, {
    create: true,
  });
  if (!access) notFound();

  const t = await getTranslations("events");
  return (
    <EventEditorShell
      backHref={`/communities/${slug}/events`}
      backLabel={access.community.name}
      title={access.canPublish ? t("createEvent") : t("submitEvent")}
    >
      <EventEditor
        communitySlug={slug}
        mode="create"
        canPublish={access.canPublish}
      />
    </EventEditorShell>
  );
}
