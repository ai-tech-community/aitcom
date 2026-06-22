"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Town Square (Plan 2b): a directory of the community's rooms. Public rooms show
 * Join/Open; private rooms render as locked teaser cards (name + purpose + count)
 * with Request access — nothing private leaks. Scoped to community members
 * (listRooms is a communityProcedure).
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

  // Skeleton grid while loading — product surfaces show shape, not a spinner.
  if (roomsQuery.isLoading) {
    return (
      <section className="mb-6">
        <SectionLabel as="h2">{t("directoryTitle")}</SectionLabel>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="border-border flex flex-col gap-3 rounded-lg border p-4"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <div className="mt-1 flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
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
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {rooms.map((room) => {
          const isMemberOfRoom = room.membership === "active";
          const isPending = room.membership === "pending_request";
          const isPrivate = room.visibility === "private";
          const locked = isPrivate && !isMemberOfRoom;
          return (
            <div
              key={room.id}
              className={`flex flex-col gap-2 rounded-lg border p-4 transition-colors ${
                locked
                  ? "border-border bg-muted/40"
                  : "border-border hover:border-foreground/25"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {locked ? (
                  <Lock
                    aria-hidden="true"
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                ) : null}
                <h3 className="truncate text-sm font-semibold">
                  {room.name ?? t("untitled")}
                </h3>
              </div>

              {room.purpose ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {room.purpose}
                </p>
              ) : null}

              {/* Footer pinned to the card bottom so actions align across the row. */}
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <span className="text-muted-foreground font-mono text-xs">
                  {t("memberCount", { count: room.memberCount })}
                </span>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
