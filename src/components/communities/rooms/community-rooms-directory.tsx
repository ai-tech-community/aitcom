"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, Users } from "lucide-react";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { SpaceAvatar } from "./space-avatar";

/**
 * Town Square (Plan 2b): a directory of the community's rooms, rendered as a
 * scannable list. Public rooms show Join/Open; private rooms appear as locked
 * teaser rows (name + purpose + member count) with Request access — nothing
 * private leaks. Scoped to community members (listRooms is a communityProcedure).
 *
 * NOTE: intentionally not mounted on the community overview (a full list there
 * doesn't scale once a community has many rooms). Staged for the dedicated
 * Rooms index / ASCII Discover surface — do not delete as "dead code".
 */
export function CommunityRoomsDirectory({ slug }: { slug: string }) {
  const t = useTranslations("communities.rooms");
  const utils = api.useUtils();
  const roomsQuery = api.spaces.listRooms.useQuery({ slug });

  const joinMutation = api.spaces.joinRoom.useMutation({
    onSuccess: () => void utils.spaces.listRooms.invalidate({ slug }),
    onError: (e) => toast.error(e.message),
  });
  const requestMutation = api.spaces.requestAccess.useMutation({
    onSuccess: () => void utils.spaces.listRooms.invalidate({ slug }),
    onError: (e) => toast.error(e.message),
  });

  if (roomsQuery.isLoading) {
    return (
      <section className="mb-6">
        <SectionLabel as="h2">{t("directoryTitle")}</SectionLabel>
        <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (roomsQuery.isError) {
    return (
      <div className="mb-6">
        <ErrorState onRetry={() => roomsQuery.refetch()} />
      </div>
    );
  }

  const rooms = roomsQuery.data ?? [];
  if (rooms.length === 0) return null;

  return (
    <section className="mb-6">
      <SectionLabel as="h2">
        {t("directoryTitle")} · {rooms.length}
      </SectionLabel>
      <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
        {rooms.map((room) => {
          const isMemberOfRoom = room.membership === "active";
          const isPending = room.membership === "pending_request";
          const isPrivate = room.visibility === "private";
          const locked = isPrivate && !isMemberOfRoom;
          return (
            <li
              key={room.id}
              className="hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors"
            >
              <SpaceAvatar name={room.name} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {locked ? (
                    <Lock
                      aria-hidden="true"
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                  ) : null}
                  <span className="truncate text-sm font-semibold">
                    {room.name ?? t("untitled")}
                  </span>
                </div>
                {room.purpose ? (
                  <p className="text-muted-foreground truncate text-sm">
                    {room.purpose}
                  </p>
                ) : null}
              </div>

              <span
                className="text-muted-foreground hidden shrink-0 items-center gap-1 font-mono text-xs sm:inline-flex"
                aria-label={t("memberCount", { count: room.memberCount })}
              >
                <Users aria-hidden="true" className="size-3.5" />
                {room.memberCount}
              </span>

              <div className="shrink-0">
                {isMemberOfRoom ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/communities/${slug}/spaces/${room.slug}`}>
                      {t("open")}
                    </Link>
                  </Button>
                ) : isPending ? (
                  <Button variant="ghost" size="sm" disabled>
                    {t("pendingShort")}
                  </Button>
                ) : isPrivate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={requestMutation.isPending}
                    onClick={() =>
                      requestMutation.mutate({ slug, spaceId: room.id })
                    }
                  >
                    {t("requestAccess.label")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={joinMutation.isPending}
                    onClick={() => joinMutation.mutate({ slug, spaceId: room.id })}
                  >
                    {t("join.label")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
