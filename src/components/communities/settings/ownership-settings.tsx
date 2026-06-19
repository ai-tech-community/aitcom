"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

interface OwnershipSettingsProps {
  slug: string;
}

export function OwnershipSettings({ slug }: OwnershipSettingsProps) {
  const t = useTranslations("communities.settings.ownership");
  const utils = api.useUtils();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data: membersData,
    isLoading: membersLoading,
    isError: membersError,
    refetch: refetchMembers,
  } = api.communities.getMembers.useQuery({
    slug,
    limit: 50,
    status: "active",
  });

  const transferMutation = api.communities.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success(t("transferred"));
      void utils.communities.getMyCommunities.invalidate();
      void utils.communities.getMembers.invalidate();
      router.push(`/communities/${slug}` as never);
    },
  });

  const members = (membersData?.items ?? []).filter(
    (m) => m.userId !== session?.user?.id,
  );

  const selectedMember = members.find((m) => m.userId === selectedUserId);

  const handleTransfer = () => {
    if (!selectedUserId) return;
    transferMutation.mutate({ slug, userId: selectedUserId });
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <div className="border-warning/30 bg-warning/15 flex items-start gap-3 rounded-lg border p-4">
        <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" />
        <p className="text-warning text-sm">{t("warning")}</p>
      </div>

      {membersLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
        </div>
      ) : membersError ? (
        <ErrorState onRetry={refetchMembers} />
      ) : (
        // Empty (no transferable members) falls through to the Select's
        // placeholder; the transfer button stays disabled (No-Silent-Failure:
        // loading + error are distinct above).
        <div className="space-y-4">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder={t("selectMember")} />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.displayName ?? "Member"} ({member.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="destructive"
            disabled={!selectedUserId || transferMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {t("transfer")}
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("confirmDescription", {
                name: selectedMember?.displayName ?? "this member",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransfer}
              disabled={transferMutation.isPending}
            >
              {transferMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t("confirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
