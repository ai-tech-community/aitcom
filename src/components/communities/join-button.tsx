"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, Clock, LogOut, Loader2 } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import { HUB_SLUG } from "@/server/communities/hub";

type JoinPolicy = "open" | "invite_only" | "approval_required";
type MembershipStatus = "active" | "pending_approval" | "invited" | null;

interface JoinButtonProps {
  slug: string;
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function JoinButton({
  slug,
  joinPolicy,
  membershipStatus,
  memberRole,
}: JoinButtonProps) {
  const t = useTranslations("communities.profile");
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const { promptAuth } = useRequireAuth();
  const utils = api.useUtils();
  const [isLoading, setIsLoading] = useState(false);

  const joinMutation = api.communities.join.useMutation({
    onSuccess: () => {
      void utils.communities.getMyCommunities.invalidate();
      void utils.communities.getBySlug.invalidate({ slug });
      void utils.communities.getMembers.invalidate({ slug });
      router.refresh();
    },
  });

  const requestMutation = api.communities.requestToJoin.useMutation({
    onSuccess: () => {
      void utils.communities.getMyCommunities.invalidate();
      router.refresh();
    },
  });

  const leaveMutation = api.communities.leave.useMutation({
    onSuccess: () => {
      void utils.communities.getMyCommunities.invalidate();
      void utils.communities.getBySlug.invalidate({ slug });
      void utils.communities.getMembers.invalidate({ slug });
      router.refresh();
    },
  });

  const handleAction = async () => {
    if (!session?.user) {
      promptAuth("Sign in to join this community");
      return;
    }

    setIsLoading(true);
    try {
      if (membershipStatus === "active") {
        await leaveMutation.mutateAsync({ slug });
        toast.success(t("leave"));
      } else if (joinPolicy === "open") {
        await joinMutation.mutateAsync({ slug });
        toast.success(t("join"));
      } else if (joinPolicy === "approval_required") {
        await requestMutation.mutateAsync({ slug });
        toast.success(t("requestToJoin"));
      }
    } catch {
      // tRPC errors are handled by the global error handler
    } finally {
      setIsLoading(false);
    }
  };

  // Invite-only communities: no join button unless already a member
  if (joinPolicy === "invite_only" && membershipStatus !== "active") {
    return null;
  }

  // Pending approval: show disabled pending badge
  if (membershipStatus === "pending_approval") {
    return (
      <Button variant="outline" disabled>
        <Clock className="size-4" />
        {t("pending")}
      </Button>
    );
  }

  // Owners cannot leave their community. Hub is the root every member
  // belongs to — the header Member badge is the "you're in" signal.
  if (
    membershipStatus === "active" &&
    (memberRole === "owner" || slug === HUB_SLUG)
  ) {
    return null;
  }

  // Active member: show leave button
  if (membershipStatus === "active") {
    return (
      <Button variant="outline" onClick={handleAction} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogOut className="size-4" />
        )}
        {t("leave")}
      </Button>
    );
  }

  // Not a member: show join or request button
  const label =
    joinPolicy === "approval_required" ? t("requestToJoin") : t("join");

  return (
    <Button onClick={handleAction} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogIn className="size-4" />
      )}
      {label}
    </Button>
  );
}
