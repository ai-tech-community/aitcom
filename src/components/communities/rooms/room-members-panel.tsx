"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function RoomMembersPanel({
  slug,
  spaceId,
  spaceSlug,
  viewerIsAdmin,
}: {
  slug: string;
  spaceId: string;
  spaceSlug: string;
  viewerIsAdmin: boolean;
}) {
  const t = useTranslations("communities.rooms");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const utils = api.useUtils();

  const membersQuery = api.spaces.listRoomMembers.useQuery(
    { slug, spaceId },
    { enabled: open },
  );

  const communityMembersQuery = api.members.listMembers.useQuery(
    { search, limit: 10 },
    { enabled: viewerIsAdmin && open },
  );

  const approveMutation = api.spaces.approveMember.useMutation({
    onSuccess: () => { void utils.spaces.listRoomMembers.invalidate({ slug, spaceId }); },
    onError: (e) => toast.error(e.message),
  });

  const addMutation = api.spaces.addMember.useMutation({
    onSuccess: () => {
      void utils.spaces.listRoomMembers.invalidate({ slug, spaceId });
      void utils.spaces.getRoom.invalidate({ slug: spaceSlug, spaceSlug });
    },
    onError: (e) => toast.error(e.message),
  });

  const allMembers = membersQuery.data ?? [];
  const activeMembers = allMembers.filter((m) => m.status !== "pending_request");
  const pendingMembers = allMembers.filter((m) => m.status === "pending_request");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={t("members")}>
          {t("members")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("members")}</SheetTitle>
        </SheetHeader>

        {membersQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : membersQuery.isError ? (
          <ErrorState onRetry={() => membersQuery.refetch()} />
        ) : (
          <div className="mt-4 overflow-y-auto">
            {/* Active members — visible to all room members */}
            {activeMembers.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noMembers")}</p>
            ) : (
              activeMembers.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 py-2">
                  <Avatar size="sm">
                    <AvatarImage src={m.avatarUrl ?? undefined} alt={m.displayName ?? ""} />
                    <AvatarFallback>{getInitials(m.displayName ?? "")}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{m.displayName}</span>
                </div>
              ))
            )}

            {/* Pending requests — admin-only */}
            {viewerIsAdmin && pendingMembers.length > 0 ? (
              <div className="mt-4 border-t pt-4">
                <p className="text-muted-foreground mb-2 text-xs">
                  {t("pendingRequests")}
                </p>
                {pendingMembers.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        <AvatarImage
                          src={m.avatarUrl ?? undefined}
                          alt={m.displayName ?? ""}
                        />
                        <AvatarFallback>{getInitials(m.displayName ?? "")}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{m.displayName}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={approveMutation.isPending}
                      aria-label={`${t("approve")} ${m.displayName ?? ""}`}
                      onClick={() =>
                        approveMutation.mutate({ slug, spaceId, userId: m.userId })
                      }
                    >
                      {t("approve")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add members — admin-only */}
            {viewerIsAdmin ? (
              <div className="mt-4 border-t pt-4">
                <p className="text-muted-foreground mb-2 text-xs">
                  {t("addMembers")}
                </p>
                <Input
                  placeholder={t("searchMembers")}
                  aria-label={t("searchMembers")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-3"
                />
                {communityMembersQuery.isLoading ? (
                  <div className="flex justify-center py-2">
                    <Spinner className="size-4" />
                  </div>
                ) : null}
                {communityMembersQuery.data?.items.map((m) => {
                  const alreadyMember = activeMembers.some(
                    (am) => am.userId === m.profile.userId,
                  );
                  if (alreadyMember) return null;
                  return (
                    <div
                      key={m.profile.userId}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarImage
                            src={m.avatarUrl ?? undefined}
                            alt={m.profile.displayName ?? ""}
                          />
                          <AvatarFallback>
                            {getInitials(m.profile.displayName ?? "")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{m.profile.displayName}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={addMutation.isPending}
                        aria-label={`${t("add")} ${m.profile.displayName ?? ""}`}
                        onClick={() =>
                          addMutation.mutate({
                            slug,
                            spaceId,
                            userId: m.profile.userId,
                          })
                        }
                      >
                        {t("add")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
