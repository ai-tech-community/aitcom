"use client";

import Image from "next/image";
import { api } from "@/trpc/react";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { Link } from "@/i18n/navigation";

interface EventAttendeesProps {
  eventId: number;
  maxAttendees: number | null;
  isExternal?: boolean;
}

export function EventAttendees({
  eventId,
  maxAttendees,
  isExternal = false,
}: EventAttendeesProps) {
  const { data: count = 0 } = api.events.registrationCount.useQuery({
    eventId,
    includeIntent: isExternal,
  });
  const { data: attendees = [] } = api.events.getAttendees.useQuery({
    eventId,
    limit: 20,
    includeIntent: isExternal,
  });

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
          <div className="flex items-center justify-between font-mono text-[11px] tracking-wider">
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
        <div className="font-mono text-[11px] tracking-wider">
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
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={attendee.displayName}
                    className="h-5 w-5 rounded-full object-cover"
                    width={20}
                    height={20}
                  />
                ) : (
                  <div className="bg-secondary text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full font-mono text-[8px]">
                    {initials}
                  </div>
                )}
                <span className="text-muted-foreground group-hover:text-foreground font-mono text-[10px] tracking-wider">
                  {attendee.displayName}
                </span>
              </Link>
            );
          })}
          {count > attendees.length && (
            <span className="text-muted-foreground flex items-center px-2 font-mono text-[10px] tracking-wider">
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
