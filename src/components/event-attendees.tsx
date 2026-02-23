"use client";

import { api } from "@/trpc/react";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { Link } from "@/i18n/navigation";

interface EventAttendeesProps {
  eventId: number;
  maxAttendees: number | null;
}

export function EventAttendees({ eventId, maxAttendees }: EventAttendeesProps) {
  const { data: count = 0 } = api.events.registrationCount.useQuery({
    eventId,
  });
  const { data: attendees = [] } = api.events.getAttendees.useQuery({
    eventId,
    limit: 20,
  });

  const isFull = maxAttendees !== null && count >= maxAttendees;

  return (
    <div className="space-y-6">
      {/* Capacity bar */}
      {maxAttendees !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-[11px] tracking-wider">
            <span className="text-muted-foreground">
              {count} / {maxAttendees} REGISTERED
            </span>
            {isFull && (
              <span className="text-primary font-medium">FULL</span>
            )}
          </div>
          <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{
                width: `${Math.min((count / maxAttendees) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Attendee list */}
      {attendees.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attendees.map((attendee) => {
            const avatarUrl = getAvatarUrl(attendee.email, attendee.image);
            const initials = getInitials(attendee.displayName);

            return (
              <Link
                key={attendee.userId}
                href={`/members/${attendee.userId}`}
                className="group flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-1 transition-colors hover:border-foreground/30"
                title={attendee.displayName}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={attendee.displayName}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary font-mono text-[8px] text-muted-foreground">
                    {initials}
                  </div>
                )}
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground group-hover:text-foreground">
                  {attendee.displayName}
                </span>
              </Link>
            );
          })}
          {count > attendees.length && (
            <span className="flex items-center px-2 font-mono text-[10px] tracking-wider text-muted-foreground">
              +{count - attendees.length} more
            </span>
          )}
        </div>
      ) : (
        <p className="font-mono text-xs tracking-wider text-muted-foreground">
          No attendees yet. Be the first to register!
        </p>
      )}
    </div>
  );
}
