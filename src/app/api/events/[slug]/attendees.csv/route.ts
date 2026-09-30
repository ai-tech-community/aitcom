import { NextResponse } from "next/server";
import { createTranslator } from "next-intl";

import { loadMessages, resolveLocale } from "@/i18n/messages";
import { VIEW_STATUSES, parseAttendeeView } from "@/lib/events/attendee-views";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { toAttendeesCsv } from "@/server/events/attendee-csv";
import { readAttendeesForOrganizer } from "@/server/events/organizer-attendees";

export const dynamic = "force-dynamic";

/**
 * The event organizer's attendee list as CSV (ADR-0038):
 * `?view=` picks the same slice as the page (default "active"), `?locale=`
 * the language of the headers. Same reader, same access and privacy rules
 * as the page; anyone but the organizer gets 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const data = await readAttendeesForOrganizer(db, session.user.id, { slug });
  if (!data) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const view = parseAttendeeView(url.searchParams.get("view"));
  // A route handler has no page locale: the button passes its own. The
  // translator is built from the catalogue directly, needing no request
  // context.
  const locale = resolveLocale(url.searchParams.get("locale"));
  const t = createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: "events.attendeeList",
  });

  const csv = toAttendeesCsv(
    data.rows.filter((row) => VIEW_STATUSES[view].includes(row.status)),
    {
      timezone: data.event.timezone,
      questions: data.questions,
      labels: {
        name: t("csv.name"),
        firstName: t("csv.firstName"),
        lastName: t("csv.lastName"),
        email: t("csv.email"),
        status: t("csv.status"),
        registeredAt: (timezone) => t("csv.registeredAt", { timezone }),
        waitlistPlace: t("csv.waitlistPlace"),
        paymentStatus: t("csv.paymentStatus"),
        checkedInAt: (timezone) => t("csv.checkedInAt", { timezone }),
        memberSince: t("csv.memberSince"),
        earlierEvents: t("csv.earlierEvents"),
        company: t("company"),
        linkedin: "LinkedIn",
        github: "GitHub",
        website: t("website"),
        experience: t("experience"),
        skills: t("skills"),
        interests: t("interests"),
        statuses: {
          registered: t("status.registered"),
          waitlisted: t("status.waitlisted"),
          pending_payment: t("status.pending_payment"),
          attended: t("status.attended"),
          cancelled: t("status.cancelled"),
          payment_failed: t("status.payment_failed"),
        },
      },
    },
  );

  const suffix = view === "active" ? "" : `-${view}`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.event.slug}-attendees${suffix}.csv"`,
      // Personal data: never kept by a shared cache or the browser cache.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
