"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import { api, type RouterOutputs } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";

type AttendeesData = RouterOutputs["events"]["attendees"];
type Attendee = AttendeesData["rows"][number];
type Status = Attendee["status"];

/** The list views. "active" is everyone still coming or waiting. */
type View =
  | "active"
  | "registered"
  | "waitlisted"
  | "pending"
  | "attended"
  | "cancelled";

const VIEW_STATUSES: Record<View, readonly Status[]> = {
  active: ["registered", "waitlisted", "pending_payment", "attended"],
  registered: ["registered"],
  waitlisted: ["waitlisted"],
  pending: ["pending_payment"],
  attended: ["attended"],
  cancelled: ["cancelled", "payment_failed"],
};

const STATUS_BADGE: Record<
  Status,
  "success" | "warning" | "info" | "secondary" | "outline"
> = {
  registered: "success",
  waitlisted: "warning",
  pending_payment: "info",
  attended: "secondary",
  cancelled: "outline",
  payment_failed: "outline",
};

/**
 * The event organizer's view of who registered (ADR-0038). Every row comes
 * from the server's attendee read model, which has already applied the
 * privacy rule; this component only presents and filters.
 */
export function OrganizerAttendeeList({ eventId }: { eventId: number }) {
  const t = useTranslations("events.attendeeList");
  const query = api.events.attendees.useQuery({ eventId });
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        VIEW_STATUSES[view].includes(row.status) &&
        (!needle ||
          [row.displayName, row.email, row.profile?.company]
            .filter(Boolean)
            .some((text) => text!.toLowerCase().includes(needle))),
    );
  }, [query.data, view, search]);

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        description={t("loadError")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { counts, event, rows } = query.data;
  if (rows.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyHint")} />;
  }

  const count = (v: View) =>
    VIEW_STATUSES[v].reduce((sum, status) => sum + counts[status], 0);
  const views: { value: View; label: string }[] = (
    [
      "active",
      "registered",
      "waitlisted",
      ...(event.isPaid || counts.pending_payment > 0
        ? ["pending" as const]
        : []),
      "attended",
      "cancelled",
    ] as View[]
  ).map((v) => ({ value: v, label: `${t(`view.${v}`)} ${count(v)}` }));

  const seats =
    event.maxAttendees !== null
      ? t("seats", {
          taken: counts.registered + counts.attended,
          max: event.maxAttendees,
        })
      : null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground font-mono text-xs tracking-wider tabular-nums">
        {[
          t("summary.registered", { count: counts.registered }),
          t("summary.waitlisted", { count: counts.waitlisted }),
          t("summary.attended", { count: counts.attended }),
          seats,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-full max-sm:-m-1 max-sm:overflow-x-auto max-sm:p-1">
          <SegmentedControl
            aria-label={t("viewsLabel")}
            options={views}
            value={view}
            onValueChange={setView}
          />
        </div>
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-64"
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title={t("noMatches")} description={t("noMatchesHint")} />
      ) : (
        <ul className="divide-border border-border divide-y rounded-xl border">
          {shown.map((row) => (
            <AttendeeRow key={row.registrationId} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttendeeRow({ row }: { row: Attendee }) {
  const t = useTranslations("events.attendeeList");
  const locale = useLocale();
  const registeredAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(row.registeredAt));
  const memberSince = row.communityMemberSince
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(row.communityMemberSince),
      )
    : null;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium">{row.displayName}</p>
          {row.email ? (
            <a
              href={`mailto:${row.email}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm break-all hover:underline"
            >
              <Mail aria-hidden="true" className="size-3.5 shrink-0" />
              {row.email}
            </a>
          ) : (
            <p className="text-muted-foreground text-sm">{t("notShared")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE[row.status]}>
            {t(`status.${row.status}`)}
            {row.waitlistPosition !== null ? ` #${row.waitlistPosition}` : ""}
          </Badge>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {registeredAt}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {[
          memberSince
            ? t("memberSince", { date: memberSince })
            : t("notMember"),
          t("pastEvents", { count: row.pastEventsAttended }),
          row.paymentStatus
            ? t("payment", { status: row.paymentStatus })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {row.detailsShared ? (
        row.profile ? (
          <details className="mt-2 text-sm">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
              {t("profile")}
            </summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              {row.profile.company ? (
                <Detail term={t("company")}>{row.profile.company}</Detail>
              ) : null}
              {row.profile.experienceLevel ? (
                <Detail term={t("experience")}>
                  {row.profile.experienceLevel}
                </Detail>
              ) : null}
              {row.profile.skills.length > 0 ? (
                <Detail term={t("skills")}>
                  {row.profile.skills.join(", ")}
                </Detail>
              ) : null}
              {row.profile.interests.length > 0 ? (
                <Detail term={t("interests")}>
                  {row.profile.interests.join(", ")}
                </Detail>
              ) : null}
              {(
                [
                  ["LinkedIn", row.profile.linkedinUrl],
                  ["GitHub", row.profile.githubUrl],
                  [t("website"), row.profile.websiteUrl],
                ] as const
              ).map(([label, url]) =>
                url ? (
                  <Detail key={label} term={label}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all hover:underline"
                    >
                      {url}
                    </a>
                  </Detail>
                ) : null,
              )}
            </dl>
          </details>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("profilePrivate")}
          </p>
        )
      ) : null}
    </li>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
