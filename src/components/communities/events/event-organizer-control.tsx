"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, UserCog, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";

/** The organizer's attendee list for a community event (ADR-0038). */
export function attendeesHref(communitySlug: string, eventSlug: string) {
  return `/communities/${communitySlug}/events/${eventSlug}/attendees`;
}

/** Opens the attendee list: navigation, so a link, not a button. */
export function AttendeesLink({ href }: { href: string }) {
  const t = useTranslations("events.attendeeList");
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>
        <Users aria-hidden="true" />
        {t("openLink")}
      </Link>
    </Button>
  );
}

export interface EventOrganizerInfo {
  organizer: { userId: string; name: string } | null;
  canChange: boolean;
}

/**
 * Who organizes an event (ADR-0038), on the community's event rows for its
 * owner and admins. Named by its visible words: "Organizer: Ada". For the
 * owner, and for the organizer themselves, the words are a button that opens
 * the picker to hand the event to another active member.
 */
export function EventOrganizerControl({
  eventId,
  info,
}: {
  eventId: number;
  info: EventOrganizerInfo;
}) {
  const t = useTranslations("events");
  const [open, setOpen] = useState(false);
  const label = info.organizer
    ? t("organizerLabel", { name: info.organizer.name })
    : t("organizerNone");

  if (!info.canChange) {
    return (
      <span className="text-muted-foreground inline-flex min-h-8 items-center px-2 text-sm">
        {label}
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(!info.organizer && "text-warning hover:text-warning")}
        onClick={() => setOpen(true)}
      >
        <UserCog aria-hidden="true" />
        {info.organizer ? label : t("organizerChoose")}
      </Button>
      {open ? (
        <ChooseOrganizerDialog
          eventId={eventId}
          currentId={info.organizer?.userId ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ChooseOrganizerDialog({
  eventId,
  currentId,
  onClose,
}: {
  eventId: number;
  currentId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("communities");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [selected, setSelected] = useState<string | null>(null);

  const candidates = api.events.organizerCandidates.useQuery({
    eventId,
    query: deferredQuery,
  });

  const utils = api.useUtils();
  const setOrganizer = api.events.setOrganizer.useMutation({
    onSuccess: () => {
      toast.success(t("organizerChanged"));
      void utils.events.communityEventOrganizers.invalidate();
      onClose();
    },
    // A translated message, never the raw server text.
    onError: () => toast.error(t("organizerChangeError")),
  });

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organizerDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("organizerDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <Input
          type="search"
          aria-label={t("organizerSearch")}
          placeholder={t("organizerSearch")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="max-h-72 min-h-24 overflow-y-auto">
          {candidates.isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : candidates.isError ? (
            <ErrorState
              description={t("organizerLoadError")}
              onRetry={() => void candidates.refetch()}
            />
          ) : candidates.data?.length === 0 ? (
            <EmptyState
              title={t("organizerNoMatches")}
              description={t("organizerNoMatchesHint")}
            />
          ) : (
            <ul role="radiogroup" aria-label={t("organizerDialogTitle")}>
              {candidates.data?.map((member) => {
                const isChosen = (selected ?? currentId) === member.userId;
                return (
                  <li key={member.userId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isChosen}
                      onClick={() => setSelected(member.userId)}
                      className={cn(
                        "hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-[3px]",
                        isChosen && "bg-accent",
                      )}
                    >
                      <Avatar className="size-7">
                        {member.image ? (
                          <AvatarImage src={member.image} alt="" />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {member.name}
                      </span>
                      {member.isCurrent ? (
                        <Badge variant="secondary">
                          {t("organizerCurrent")}
                        </Badge>
                      ) : member.role !== "member" ? (
                        <Badge variant="outline">
                          {tc(`roles.${member.role}`)}
                        </Badge>
                      ) : null}
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          isChosen ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("organizerCancel")}
          </Button>
          <Button
            type="button"
            disabled={
              !selected || selected === currentId || setOrganizer.isPending
            }
            onClick={() =>
              selected && setOrganizer.mutate({ eventId, userId: selected })
            }
          >
            {t("organizerConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
