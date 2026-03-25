"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ManageMembersPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");
  const tRoles = useTranslations("communities.roles");
  const utils = api.useUtils();

  const { data: membersData, isLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 50 });

  const banMutation = api.communities.banMember.useMutation({
    onSuccess: () => {
      toast.success(t("memberBanned"));
      void utils.communities.invalidate();
    },
  });

  const removeMutation = api.communities.removeMember.useMutation({
    onSuccess: () => {
      toast.success(t("memberRemoved"));
      void utils.communities.invalidate();
    },
  });

  const handleBan = (userId: string) => {
    if (window.confirm(t("banConfirm"))) {
      banMutation.mutate({ slug, userId });
    }
  };

  const handleRemove = (userId: string) => {
    if (window.confirm(t("removeConfirm"))) {
      removeMutation.mutate({ slug, userId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const members = membersData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("members")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {members.length} {t("members").toLowerCase()}
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("noMembers")}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {members.map((member) => {
            const isPending =
              (banMutation.isPending &&
                banMutation.variables?.userId === member.userId) ||
              (removeMutation.isPending &&
                removeMutation.variables?.userId === member.userId);

            return (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    {member.image ? (
                      <AvatarImage
                        src={member.image}
                        alt={member.displayName ?? ""}
                      />
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
                      {tRoles(
                        member.role as
                          | "owner"
                          | "admin"
                          | "moderator"
                          | "member",
                      )}
                    </Badge>
                  </div>
                </div>

                {member.role !== "owner" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRemove(member.userId)}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        t("remove")
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleBan(member.userId)}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        t("ban")
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
