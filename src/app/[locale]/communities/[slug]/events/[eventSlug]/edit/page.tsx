import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EventEditor } from "@/components/events/editor/event-editor";
import { EventEditorShell } from "@/components/events/editor/event-editor-shell";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { resolveEditorAccess } from "@/server/events/event-editor-access";

/**
 * Edit an event (admins) or fix and resubmit a rejected submission (its
 * submitter; `?resubmit=1` from "My submissions"). Anyone else: 404.
 */
export default async function EditCommunityEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string; eventSlug: string }>;
  searchParams: Promise<{ resubmit?: string }>;
}) {
  const { locale, slug, eventSlug } = await params;
  const { resubmit } = await searchParams;
  const session = await getSession();
  if (!session?.user) {
    const here = `/${locale}/communities/${slug}/events/${eventSlug}/edit`;
    redirect(`/${locale}/auth/signin?redirect=${encodeURIComponent(here)}`);
  }
  const access = await resolveEditorAccess(db, session.user.id, slug, {
    eventSlug,
    wantsResubmit: resubmit === "1",
  });
  if (!access?.event) notFound();

  const t = await getTranslations("events");
  return (
    <EventEditorShell
      backHref={`/communities/${slug}/events`}
      backLabel={access.community.name}
      title={
        access.mode === "resubmit"
          ? t("dialogEditResubmitTitle")
          : t("editEvent")
      }
      subtitle={access.event.title}
    >
      <EventEditor
        communitySlug={slug}
        mode={access.mode}
        eventId={access.event.id}
        canPublish={access.canPublish}
      />
    </EventEditorShell>
  );
}
