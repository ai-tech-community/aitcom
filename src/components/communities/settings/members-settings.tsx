"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MembersSettingsProps {
  slug: string;
  joinPolicy: "open" | "invite_only" | "approval_required";
  myRole: "owner" | "admin" | "moderator" | "member";
}

export function MembersSettings({ slug, joinPolicy, myRole }: MembersSettingsProps) {
  const t = useTranslations("communities.settings.members");
  const tRoles = useTranslations("communities.roles");
  const tManage = useTranslations("communities.manage");
  const utils = api.useUtils();
  const { data: session } = authClient.useSession();

  const { data: activeData, isLoading: activeLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 50, status: "active" });

  const { data: pendingData, isLoading: pendingLoading } =
    api.communities.getMembers.useQuery(
      { slug, limit: 50, status: "pending_approval" },
      { enabled: joinPolicy === "approval_required" },
    );

  const { data: bannedData, isLoading: bannedLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 50, status: "banned" });

  const setRoleMutation = api.communities.setMemberRole.useMutation({
    onSuccess: () => {
      toast.success(t("roleChanged"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const approveMutation = api.communities.approveRequest.useMutation({
    onSuccess: () => {
      toast.success(t("approved"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const rejectMutation = api.communities.rejectRequest.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const removeMutation = api.communities.removeMember.useMutation({
    onSuccess: () => {
      toast.success(tManage("memberRemoved"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const banMutation = api.communities.banMember.useMutation({
    onSuccess: () => {
      toast.success(tManage("memberBanned"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const unbanMutation = api.communities.unbanMember.useMutation({
    onSuccess: () => {
      toast.success(t("unbanned"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const activeMembers = activeData?.items ?? [];
  const pendingMembers = pendingData?.items ?? [];
  const bannedMembers = bannedData?.items ?? [];

  const canManage = (targetRole: string) => {
    if (myRole === "owner") return targetRole !== "owner";
    if (myRole === "admin") return targetRole === "moderator" || targetRole === "member";
    return false;
  };

  const availableRoles = () => {
    if (myRole === "owner") return ["admin", "moderator", "member"] as const;
    if (myRole === "admin") return ["moderator", "member"] as const;
    return [] as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {tManage("members")}
        </h2>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            {t("activeTab")} ({activeMembers.length})
          </TabsTrigger>
          {joinPolicy === "approval_required" && (
            <TabsTrigger value="pending">
              {t("pendingTab")} ({pendingMembers.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="banned">
            {t("bannedTab")} ({bannedMembers.length})
          </TabsTrigger>
        </TabsList>

        {/* Active members */}
        <TabsContent value="active">
          {activeLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeMembers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {tManage("noMembers")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {activeMembers.map((member) => {
                const isSelf = member.userId === session?.user?.id;
                const showActions = !isSelf && canManage(member.role);

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {member.image ? (
                          <AvatarImage src={member.image} alt={member.displayName ?? ""} />
                        ) : null}
                        <AvatarFallback>
                          {(member.displayName ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.displayName ?? "Member"}
                        </p>
                        <Badge variant="secondary" className="mt-0.5 text-xs">
                          {tRoles(member.role)}
                        </Badge>
                      </div>
                    </div>

                    {showActions && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            setRoleMutation.mutate({
                              slug,
                              userId: member.userId,
                              role: role as "admin" | "moderator" | "member",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles().map((r) => (
                              <SelectItem key={r} value={r}>
                                {tRoles(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (window.confirm(tManage("removeConfirm"))) {
                              removeMutation.mutate({ slug, userId: member.userId });
                            }
                          }}
                        >
                          {tManage("remove")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={banMutation.isPending}
                          onClick={() => {
                            if (window.confirm(tManage("banConfirm"))) {
                              banMutation.mutate({ slug, userId: member.userId });
                            }
                          }}
                        >
                          {tManage("ban")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Pending members */}
        {joinPolicy === "approval_required" && (
          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : pendingMembers.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {t("noPending")}
              </p>
            ) : (
              <div className="divide-y rounded-lg border">
                {pendingMembers.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {member.image ? (
                          <AvatarImage src={member.image} alt={member.displayName ?? ""} />
                        ) : null}
                        <AvatarFallback>
                          {(member.displayName ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium">{member.displayName ?? "Member"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("approveConfirm"))) {
                            approveMutation.mutate({ slug, userId: member.userId });
                          }
                        }}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : t("approve")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rejectMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("rejectConfirm"))) {
                            rejectMutation.mutate({ slug, userId: member.userId });
                          }
                        }}
                      >
                        {rejectMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : t("reject")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Banned members */}
        <TabsContent value="banned">
          {bannedLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : bannedMembers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("noBanned")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bannedMembers.map((member) => (
                <div key={member.userId} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      {member.image ? (
                        <AvatarImage src={member.image} alt={member.displayName ?? ""} />
                      ) : null}
                      <AvatarFallback>
                        {(member.displayName ?? "?")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.displayName ?? "Member"}</p>
                      <Badge variant="destructive" className="mt-0.5 text-xs">Banned</Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unbanMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t("unbanConfirm"))) {
                        unbanMutation.mutate({ slug, userId: member.userId });
                      }
                    }}
                  >
                    {unbanMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : t("unban")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
