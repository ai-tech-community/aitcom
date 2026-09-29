"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * "Attendees" for the event's organizer only (ADR-0038). The event page is
 * the same for everyone; the server decides per viewer whether to show it.
 * Supplementary: while loading, on error, or for anyone else, it is absent.
 */
export function OrganizerAttendeesLink({ eventId }: { eventId: number }) {
  const t = useTranslations("events.attendeeList");
  const session = authClient.useSession();
  const link = api.events.attendeesLink.useQuery(
    { eventId },
    { enabled: !!session.data?.user },
  );
  if (!link.data) return null;
  return (
    <Button asChild variant="outline" className="w-full">
      <Link href={link.data}>
        <Users aria-hidden="true" />
        {t("openLink")}
      </Link>
    </Button>
  );
}
