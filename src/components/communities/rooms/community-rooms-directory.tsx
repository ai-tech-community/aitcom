"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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

  if (roomsQuery.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner className="size-5" />
      </div>
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
      <SectionLabel as="h2">{t("directoryTitle")}</SectionLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rooms.map((room) => {
          const isPrivate = room.visibility === "private";
          const isMemberOfRoom = room.membership === "active";
          const isPending = room.membership === "pending_request";
          const locked = isPrivate && !isMemberOfRoom;
          return (
            <div
              key={room.id}
              className="border-border flex flex-col gap-2 rounded-lg border p-4"
            >
              <div className="flex items-center gap-2">
                {locked ? (
                  <Lock className="text-muted-foreground size-4 shrink-0" />
                ) : null}
                <h3 className="truncate text-sm font-medium">
                  {room.name ?? t("untitled")}
                </h3>
              </div>
              {room.purpose ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {room.purpose}
                </p>
              ) : null}
              <p className="text-muted-foreground font-mono text-xs">
                {t("memberCount", { count: room.memberCount })}
              </p>
              <div className="mt-1">
                {isMemberOfRoom ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/communities/${slug}/spaces/${room.slug}`}>
                      {t("open")}
                    </Link>
                  </Button>
                ) : isPending ? (
                  <Button variant="outline" size="sm" disabled>
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
