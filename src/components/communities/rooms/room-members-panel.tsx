"use client";

import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { ChatAvatar } from "@/components/messages/chat-avatar";
import { getInitials } from "@/lib/avatar";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** One person row: avatar + name (truncating) + an optional trailing slot. */
function PersonRow({
  name,
  avatarUrl,
  secondary,
  redesigned = false,
  trailing,
}: {
  name: string;
  avatarUrl: string | null;
  secondary?: string | null;
  redesigned?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {redesigned ? (
        <ChatAvatar name={name} image={avatarUrl} />
      ) : (
        <Avatar size="sm">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{name}</p>
        {secondary ? (
          <p className="text-muted-foreground truncate text-xs">{secondary}</p>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

export function RoomMembersPanel({
  slug,
  spaceId,
  spaceSlug,
  viewerIsAdmin,
  redesigned = false,
}: {
  slug: string;
  spaceId: string;
  spaceSlug: string;
  viewerIsAdmin: boolean;
  redesigned?: boolean;
}) {
  const t = useTranslations("communities.rooms");
  const chat = useTranslations("redesign.chat");
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
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
    onSuccess: () => {
      void utils.spaces.listRoomMembers.invalidate({ slug, spaceId });
      void utils.spaces.getRoom.invalidate({ slug, spaceSlug });
    },
    onError: (e) => toast.error(e.message),
  });

  const addMutation = api.spaces.addMember.useMutation({
    onSuccess: () => {
      void utils.spaces.listRoomMembers.invalidate({ slug, spaceId });
      void utils.spaces.getRoom.invalidate({ slug, spaceSlug });
    },
    onError: (e) => toast.error(e.message),
  });

  const denyMutation = api.spaces.denyMember.useMutation({
    onSuccess: () => {
      void utils.spaces.listRoomMembers.invalidate({ slug, spaceId });
      void utils.spaces.getRoom.invalidate({ slug, spaceSlug });
    },
    onError: (e) => toast.error(e.message),
  });

  const allMembers = membersQuery.data ?? [];
  const pendingMembers = allMembers.filter(
    (m) => m.status === "pending_request",
  );
  // Moderators first, then members — alphabetical-stable from the query order.
  const activeMembers = allMembers
    .filter((m) => m.status !== "pending_request")
    .sort(
      (a, b) =>
        (a.role === "moderator" ? 0 : 1) - (b.role === "moderator" ? 0 : 1),
    );

  // The add list excludes everyone already in the room (active OR pending) so
  // an admin never "adds" someone who's already here or awaiting approval.
  const inRoom = new Set(allMembers.map((m) => m.userId));
  const addCandidates = (communityMembersQuery.data?.items ?? []).filter(
    (m) => !inRoom.has(m.profile.userId),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className={redesigned ? "min-h-11 shadow-none" : undefined}
          aria-label={redesigned ? chat("manageRoomMembers") : t("members")}
        >
          {redesigned ? chat("manageRoomMembers") : t("members")}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className={cn(
          "flex flex-col gap-0",
          redesigned &&
            "w-[min(95vw,24rem)] motion-reduce:animate-none [&_button]:min-h-11",
        )}
        showCloseButton={!redesigned}
        aria-describedby={undefined}
      >
        <SheetHeader
          className={cn(
            "border-b",
            redesigned && "flex-row items-center justify-between gap-2 py-2",
          )}
        >
          <SheetTitle>
            {redesigned ? chat("manageRoomMembers") : t("members")}
          </SheetTitle>
          {redesigned ? (
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={chat("closeDetails")}
              >
                <X aria-hidden />
              </Button>
            </SheetClose>
          ) : null}
        </SheetHeader>

        {membersQuery.isLoading && redesigned ? (
          <Skeleton className="m-4 h-28" />
        ) : membersQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        ) : membersQuery.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => membersQuery.refetch()} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
            {/* Pending requests — admin-only. The actionable queue leads so an
                admin arriving from a request notification acts first. */}
            {viewerIsAdmin && pendingMembers.length > 0 ? (
              <section>
                <SectionLabel as="h3">
                  {t("pendingRequests")} · {pendingMembers.length}
                </SectionLabel>
                <div className="divide-border/60 mt-1 divide-y">
                  {pendingMembers.map((m) => (
                    <PersonRow
                      redesigned={redesigned}
                      key={m.userId}
                      name={m.displayName ?? ""}
                      avatarUrl={m.avatarUrl}
                      trailing={
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={approveMutation.isPending}
                            aria-label={`${t("approve")} ${m.displayName ?? ""}`}
                            onClick={() =>
                              approveMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.userId,
                              })
                            }
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={denyMutation.isPending}
                            aria-label={`${t("deny")} ${m.displayName ?? ""}`}
                            onClick={() =>
                              denyMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.userId,
                              })
                            }
                          >
                            {t("deny")}
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* In this room — visible to all room members */}
            <section>
              <SectionLabel as="h3">
                {t("members")} · {activeMembers.length}
              </SectionLabel>
              {activeMembers.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm">
                  {t("noMembers")}
                </p>
              ) : (
                <div className="divide-border/60 mt-1 divide-y">
                  {activeMembers.map((m) => {
                    const isSelf = m.userId === currentUserId;
                    const tag = isSelf
                      ? t("you")
                      : m.role === "moderator"
                        ? t("moderator")
                        : null;
                    return (
                      <PersonRow
                        redesigned={redesigned}
                        key={m.userId}
                        name={m.displayName ?? ""}
                        avatarUrl={m.avatarUrl}
                        trailing={
                          tag ? (
                            <span className="text-muted-foreground shrink-0 font-mono text-xs tracking-wider uppercase">
                              {tag}
                            </span>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {/* Add members — admin-only */}
            {viewerIsAdmin ? (
              <section>
                <SectionLabel as="h3">{t("inviteMembers")}</SectionLabel>
                <Input
                  placeholder={t("searchMembers")}
                  aria-label={t("searchMembers")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-3"
                />
                {communityMembersQuery.isLoading && redesigned ? (
                  <Skeleton className="my-3 h-16" />
                ) : communityMembersQuery.isLoading ? (
                  <div className="flex justify-center py-4">
                    <Spinner className="size-4" />
                  </div>
                ) : communityMembersQuery.isError ? (
                  <div className="mt-2">
                    <ErrorState
                      onRetry={() => communityMembersQuery.refetch()}
                    />
                  </div>
                ) : addCandidates.length === 0 ? (
                  <p className="text-muted-foreground py-3 text-sm">
                    {t("noResults")}
                  </p>
                ) : (
                  <div className="divide-border/60 mt-1 divide-y">
                    {addCandidates.map((m) => (
                      <PersonRow
                        redesigned={redesigned}
                        key={m.profile.userId}
                        name={m.profile.displayName ?? ""}
                        avatarUrl={m.avatarUrl}
                        secondary={m.profile.company}
                        trailing={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={addMutation.isPending}
                            aria-label={`${t("invite")} ${m.profile.displayName ?? ""}`}
                            onClick={() =>
                              addMutation.mutate({
                                slug,
                                spaceId,
                                userId: m.profile.userId,
                              })
                            }
                          >
                            {t("invite")}
                          </Button>
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
