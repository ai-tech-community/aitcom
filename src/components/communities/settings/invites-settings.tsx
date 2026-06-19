"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";

interface InvitesSettingsProps {
  slug: string;
  joinPolicy: "open" | "invite_only" | "approval_required";
}

const EXPIRY_OPTIONS = [
  { value: "never", days: undefined },
  { value: "1day", days: 1 },
  { value: "7days", days: 7 },
  { value: "30days", days: 30 },
] as const;

export function InvitesSettings({ slug, joinPolicy }: InvitesSettingsProps) {
  const t = useTranslations("communities.settings.invites");
  const tRoles = useTranslations("communities.roles");
  const utils = api.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [expiresIn, setExpiresIn] = useState("never");
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);

  const {
    data: invites = [],
    isLoading,
    isError,
    refetch,
  } = api.communities.getInviteLinks.useQuery({ slug });

  const createMutation = api.communities.createInviteLink.useMutation({
    onSuccess: (data) => {
      setLastCreatedCode(data.code);
      setShowForm(false);
      setMaxUses("");
      setExpiresIn("never");
      void utils.communities.getInviteLinks.invalidate();
    },
  });

  const revokeMutation = api.communities.revokeInviteLink.useMutation({
    onSuccess: () => {
      toast.success(t("revoked"));
      void utils.communities.getInviteLinks.invalidate();
    },
  });

  const handleCreate = () => {
    const option = EXPIRY_OPTIONS.find((o) => o.value === expiresIn);
    createMutation.mutate({
      slug,
      maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
      expiresInDays: option?.days,
    });
  };

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    void navigator.clipboard.writeText(link);
    toast.success(t("linkCopied"));
  };

  const isExpired = (expiresAt: string | Date | null | undefined) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isMaxedOut = (useCount: number, maxUses: number | null) => {
    if (maxUses === null) return false;
    return useCount >= maxUses;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 size-3.5" />
            {t("create")}
          </Button>
        )}
      </div>

      {joinPolicy !== "invite_only" && (
        <div className="space-y-2 rounded-lg border p-4">
          <Label>{t("generalLink")}</Label>
          <p className="text-muted-foreground text-xs">
            {t("generalLinkDescription")}
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${slug}`}
              className="flex-1 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/invite/${slug}`,
                );
                toast.success(t("linkCopied"));
              }}
            >
              <Copy className="mr-1.5 size-3.5" />
              {t("copyLink")}
            </Button>
          </div>
        </div>
      )}

      {/* Last created link */}
      {lastCreatedCode && (
        <div className="border-success/30 bg-success/15 flex items-center gap-2 rounded-lg border p-3">
          <Input
            readOnly
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${lastCreatedCode}`}
            className="flex-1 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => copyLink(lastCreatedCode)}
          >
            <Copy className="mr-1.5 size-3.5" />
            {t("copyLink")}
          </Button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>{t("maxUses")}</Label>
            <Input
              type="number"
              min={1}
              placeholder={t("unlimited")}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("expiresIn")}</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{t("never")}</SelectItem>
                <SelectItem value="1day">{t("1day")}</SelectItem>
                <SelectItem value="7days">{t("7days")}</SelectItem>
                <SelectItem value="30days">{t("30days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              {t("create")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Invite list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : invites.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("noInvites")}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {invites.map((invite) => {
            const expired = isExpired(invite.expiresAt);
            const maxedOut = isMaxedOut(invite.useCount, invite.maxUses);
            const inactive = expired || maxedOut;

            return (
              <div
                key={invite.id}
                className={`flex items-center justify-between gap-4 p-4 ${inactive ? "opacity-50" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">{invite.code}</code>
                    {expired && (
                      <span className="text-destructive text-xs font-medium">
                        {t("expired")}
                      </span>
                    )}
                    {invite.role && (
                      <Badge variant="secondary" className="text-xs">
                        {tRoles(invite.role)}
                      </Badge>
                    )}
                    {invite.targetEmail && (
                      <span className="text-muted-foreground text-xs">
                        → {invite.targetEmail}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {invite.useCount} / {invite.maxUses ?? "∞"} uses
                    {invite.expiresAt && !expired && (
                      <>
                        {" "}
                        · Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!inactive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLink(invite.code)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t("revokeConfirm"))) {
                        revokeMutation.mutate({ slug, inviteId: invite.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
