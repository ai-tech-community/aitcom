import { ArrowLeft, ArrowUpRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { PageMain } from "@/components/page-main";
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
import { isPubliclyListedEventStatus } from "@/lib/events/event-status";
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

  if (isOpenCommunitiesEnabled()) {
    const tr = await getTranslations("redesign.events");
    return (
      <PageMain className="mx-auto w-full max-w-5xl space-y-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Button asChild variant="ghost" className="-ml-3 min-h-11">
            <Link href={`/communities/${slug}/events`}>
              <ArrowLeft aria-hidden="true" />
              {community.name}
            </Link>
          </Button>
          {isPubliclyListedEventStatus(event.status) ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={`/events/${event.slug}`}>
                {tr("eventDetails")}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
        <header className="border-border flex items-start gap-3 border-b pb-5">
          <span className="border-border bg-secondary/45 grid size-11 shrink-0 place-items-center rounded-md border sm:size-13">
            <Users aria-hidden="true" className="size-5 sm:size-6" />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {tr("organizerAttendees")}
            </h1>
            <p className="mt-1 text-base font-medium">{event.title}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("intro")}</p>
          </div>
        </header>
        <OrganizerAttendeeList eventId={event.id} />
      </PageMain>
    );
  }

  return (
    <PageMain className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
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
    </PageMain>
  );
}
