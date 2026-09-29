import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { OrganizerAttendeeList } from "@/components/events/organizer-attendee-list";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { canViewEventAttendees } from "@/server/events/attendee-access";
import { getPayloadClient } from "@/server/payload";

/**
 * The event organizer's attendee list (ADR-0038). Member-only: a guest is
 * sent to sign in and back. Anyone who is not the organizer gets a 404, so
 * the page never reveals that the list exists.
 */
export default async function EventAttendeesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; eventSlug: string }>;
}) {
  const { locale, slug, eventSlug } = await params;
  const session = await getSession();
  const viewerId = session?.user?.id ?? null;
  if (!viewerId) {
    const here = `/${locale}/communities/${slug}/events/${eventSlug}/attendees`;
    redirect(`/${locale}/auth/signin?redirect=${encodeURIComponent(here)}`);
  }

  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true, name: true },
  });
  if (!community) notFound();

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      slug: { equals: eventSlug },
      // Scoped to the URL's community, so another community's slug 404s.
      communityId: { equals: community.id },
    },
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event) notFound();

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, viewerId),
    ),
    columns: { status: true },
  });
  if (!canViewEventAttendees({ event, viewerId, membership })) notFound();

  const t = await getTranslations("events.attendeeList");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href={`/communities/${slug}/events`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {community.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {event.title}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("intro")}</p>
      <SectionLabel className="mt-8 pb-4">{t("section")}</SectionLabel>
      <OrganizerAttendeeList eventId={event.id} />
    </main>
  );
}
