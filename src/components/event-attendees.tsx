"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";

interface EventAttendeesProps {
  eventId: number;
  maxAttendees: number | null;
  isExternal?: boolean;
  compact?: boolean;
}

export function EventAttendees({
  eventId,
  maxAttendees,
  isExternal = false,
  compact = false,
}: EventAttendeesProps) {
  const t = useTranslations("redesign.events");
  const countQuery = api.events.registrationCount.useQuery({
    eventId,
    includeIntent: isExternal,
  });
  const attendeesQuery = api.events.getAttendees.useQuery({
    eventId,
    limit: 20,
    includeIntent: isExternal,
  });

  const count = countQuery.data ?? 0;
  const attendees = attendeesQuery.data ?? [];
  if (compact && (countQuery.isLoading || attendeesQuery.isLoading)) {
    return (
      <div aria-busy="true" aria-label={t("loadingAttendees")}>
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }
  if (compact && (countQuery.isError || attendeesQuery.isError)) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p>{t("loadAttendeesError")}</p>
        <Button
          variant="outline"
          className="max-sm:min-h-11"
          onClick={() => {
            void countQuery.refetch();
            void attendeesQuery.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (compact) {
    const preview = attendees.slice(0, 3);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {preview.length ? (
            <ul className="flex shrink-0 items-center">
              {preview.map((attendee) => (
                <li key={attendee.userId}>
                  <Link
                    href={`/members/${attendee.userId}`}
                    className="hover:bg-secondary focus-visible:ring-ring/50 grid size-11 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
                    title={attendee.displayName}
                    aria-label={attendee.displayName}
                  >
                    <Avatar size="sm" className="size-8">
                      <AvatarImage
                        src={getAvatarUrl(null, attendee.image) ?? undefined}
                        alt=""
                      />
                      <AvatarFallback className="bg-secondary text-xs">
                        {getInitials(attendee.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Users
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
          )}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">
              {t(isExternal ? "goingCount" : "attendeeCount", { count })}
            </span>
            {!isExternal && maxAttendees !== null ? (
              <span className="text-muted-foreground text-xs">
                {count >= maxAttendees
                  ? t("atCapacity")
                  : t("capacity", { count: maxAttendees })}
              </span>
            ) : null}
          </div>
        </div>
        {attendees.length ? (
          <details className="group text-sm">
            <summary className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden="true"
                className="size-4 group-open:rotate-180"
              />
              {t("attendeeNames")}
            </summary>
            <ul className="text-muted-foreground grid gap-1 pl-6">
              {attendees.map(({ userId, displayName }) => (
                <li key={userId}>
                  <Link
                    href={`/members/${userId}`}
                    className="hover:text-foreground inline-flex min-h-11 items-center rounded underline-offset-4 hover:underline"
                  >
                    {displayName}
                  </Link>
                </li>
              ))}
              {count > attendees.length ? (
                <li className="text-xs">
                  {t("moreAttendees", { count: count - attendees.length })}
                </li>
              ) : null}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }

  const showCapacity = !isExternal && maxAttendees !== null;
  const isFull = maxAttendees !== null && count >= maxAttendees;
  const countLabel = isExternal ? "GOING" : "REGISTERED";
  const emptyLabel = isExternal
    ? "No one marked as going yet. Be the first."
    : "No attendees yet. Be the first to register!";

  return (
    <div className="space-y-6">
      {showCapacity && (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-xs tracking-wider">
            <span className="text-muted-foreground">
              {count} / {maxAttendees} {countLabel}
            </span>
            {isFull && <span className="text-primary font-medium">FULL</span>}
          </div>
          <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{
                width: `${Math.min((count / (maxAttendees ?? 1)) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {isExternal && count > 0 && (
        <div className="font-mono text-xs tracking-wider">
          <span className="text-muted-foreground">
            {count} {count === 1 ? "MEMBER" : "MEMBERS"} {countLabel}
          </span>
        </div>
      )}

      {attendees.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attendees.map((attendee) => {
            const avatarUrl = getAvatarUrl(null, attendee.image);
            const initials = getInitials(attendee.displayName);

            return (
              <Link
                key={attendee.userId}
                href={`/members/${attendee.userId}`}
                className="group border-border hover:border-foreground/30 flex items-center gap-1.5 rounded-full border border-dashed px-2 py-1 transition-colors"
                title={attendee.displayName}
              >
                <Avatar size="sm" className="size-5">
                  {avatarUrl ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt={attendee.displayName}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="bg-secondary font-mono text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground group-hover:text-foreground font-mono text-xs tracking-wider">
                  {attendee.displayName}
                </span>
              </Link>
            );
          })}
          {count > attendees.length && (
            <span className="text-muted-foreground flex items-center px-2 font-mono text-xs tracking-wider">
              +{count - attendees.length} more
            </span>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
