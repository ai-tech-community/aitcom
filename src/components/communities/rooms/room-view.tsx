"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { ConversationView } from "@/components/messages/conversation-view";

export function RoomView({ slug, spaceSlug }: { slug: string; spaceSlug: string }) {
  const t = useTranslations("communities.rooms");
  const utils = api.useUtils();
  const { data: room, isLoading, isError, refetch } =
    api.spaces.getRoom.useQuery({ slug, spaceSlug });

  const invalidate = () => utils.spaces.getRoom.invalidate({ slug, spaceSlug });
  const join = api.spaces.joinRoom.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error(t("join.error")),
  });
  const request = api.spaces.requestAccess.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error(t("requestAccess.error")),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="size-6" /></div>;
  if (isError || !room) return <ErrorState onRetry={refetch} />;

  if (room.membership === "active" && room.conversationId) {
    return (
      // Height: fills the community content area (below ~16rem of nav + header) while
      // keeping a 24rem floor so the composer stays visible on short viewports.
      <div className="flex h-[calc(100vh-16rem)] min-h-96 flex-col">
        <ConversationView
          conversationId={room.conversationId}
          peer={{ name: room.name ?? t("untitled"), image: null, isAgent: false }}
          onToggleProfile={() => undefined}
        />
      </div>
    );
  }

  // Defensive: getRoom guarantees conversationId for active members (via
  // getOrCreateRoomConversation), so an active member reaching here is impossible
  // in production. Fall through to the join gate as a safe no-op.

  return (
    <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">{room.name}</h2>
      {room.purpose ? <p className="text-muted-foreground mt-1 text-sm">{room.purpose}</p> : null}
      {room.membership === "pending_request" ? (
        <p className="text-muted-foreground mt-6 text-sm">{t("pending")}</p>
      ) : room.visibility === "public" ? (
        <Button className="mt-6" onClick={() => join.mutate({ slug, spaceId: room.id })} disabled={join.isPending}>
          {t("join.label")}
        </Button>
      ) : (
        <Button className="mt-6" variant="outline" onClick={() => request.mutate({ slug, spaceId: room.id })} disabled={request.isPending}>
          {t("requestAccess.label")}
        </Button>
      )}
    </div>
  );
}
