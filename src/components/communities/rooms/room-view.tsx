"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { ConversationView } from "@/components/messages/conversation-view";
import { RoomMembersPanel } from "./room-members-panel";

export function RoomView({
  slug,
  spaceSlug,
  fillHeight = false,
}: {
  slug: string;
  spaceSlug: string;
  fillHeight?: boolean;
}) {
  const t = useTranslations("communities.rooms");
  const utils = api.useUtils();
  const {
    data: room,
    isLoading,
    isError,
    refetch,
  } = api.spaces.getRoom.useQuery({ slug, spaceSlug });

  const invalidate = () => utils.spaces.getRoom.invalidate({ slug, spaceSlug });
  const join = api.spaces.joinRoom.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error(t("join.error")),
  });
  const request = api.spaces.requestAccess.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error(t("requestAccess.error")),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  if (isError || !room) return <ErrorState onRetry={refetch} />;

  if (room.membership === "active" && room.conversationId) {
    const MAX_SHOWN_AVATARS = 3;

    return (
      <div
        className={
          fillHeight
            ? "flex h-full min-h-0 flex-col"
            : "flex h-[calc(100vh-16rem)] min-h-96 flex-col"
        }
      >
        {/* Room header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base leading-tight font-semibold">
                {room.name ?? t("untitled")}
              </h1>
              {room.purpose ? (
                <p className="text-muted-foreground text-xs">{room.purpose}</p>
              ) : null}
            </div>
            {/* Visibility marker — Mono-Is-Machine */}
            {room.visibility === "private" ? (
              <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
                <Lock className="size-3" aria-hidden />
                {t("private")}
              </span>
            ) : (
              <span className="text-muted-foreground font-mono text-xs">
                {t("public")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Avatar stack */}
            {room.memberAvatars && room.memberAvatars.length > 0 ? (
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  {room.memberAvatars.slice(0, MAX_SHOWN_AVATARS).map((av) => (
                    <Avatar
                      key={av.userId}
                      size="sm"
                      className="border-background ring-background border-2"
                    >
                      <AvatarImage
                        src={av.avatarUrl ?? undefined}
                        alt={av.displayName ?? ""}
                      />
                      <AvatarFallback>
                        {getInitials(av.displayName ?? "")}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {room.memberCount > MAX_SHOWN_AVATARS ? (
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    +{room.memberCount - MAX_SHOWN_AVATARS}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-muted-foreground font-mono text-xs">
                {t("memberCount", { count: room.memberCount })}
              </span>
            )}
            {/* Members panel */}
            <RoomMembersPanel
              slug={slug}
              spaceId={room.id}
              spaceSlug={spaceSlug}
              viewerIsAdmin={room.viewerIsAdmin}
            />
          </div>
        </div>
        {/* Headerless chat — fills remaining height */}
        <div className="min-h-0 flex-1">
          <ConversationView
            conversationId={room.conversationId}
            peer={{
              name: room.name ?? t("untitled"),
              image: null,
              isAgent: false,
            }}
            hideHeader
          />
        </div>
      </div>
    );
  }

  // Defensive: getRoom guarantees conversationId for active members (via
  // getOrCreateRoomConversation), so an active member reaching here is impossible
  // in production. Fall through to the join gate as a safe no-op.

  return (
    <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">{room.name}</h2>
      {room.purpose ? (
        <p className="text-muted-foreground mt-1 text-sm">{room.purpose}</p>
      ) : null}
      {room.membership === "pending_request" ? (
        <p className="text-muted-foreground mt-6 text-sm">{t("pending")}</p>
      ) : room.visibility === "public" ? (
        <Button
          className="mt-6"
          onClick={() => join.mutate({ slug, spaceId: room.id })}
          disabled={join.isPending}
        >
          {t("join.label")}
        </Button>
      ) : (
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => request.mutate({ slug, spaceId: room.id })}
          disabled={request.isPending}
        >
          {t("requestAccess.label")}
        </Button>
      )}
    </div>
  );
}
