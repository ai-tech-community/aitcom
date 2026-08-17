"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BadgeCheck, Github, Linkedin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

export function ConnectedIdentities() {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const utils = api.useUtils();
  const { data, isLoading } = api.members.getMyProfile.useQuery();
  const [pending, setPending] = useState<"github" | "linkedin" | null>(null);

  const disconnect = api.members.disconnectSocial.useMutation({
    onSuccess: async () => {
      toast.success(t("socialDisconnected"));
      await utils.members.getMyProfile.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || t("socialDisconnectError"));
    },
    onSettled: () => setPending(null),
  });

  async function connect(provider: "github" | "linkedin") {
    setPending(provider);
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL: pathname,
    });
    if (error) {
      toast.error(error.message ?? t("socialConnectError"));
      setPending(null);
    }
  }

  if (isLoading || !data) return null;

  const githubConnected = data.accounts.github;
  const linkedinConnected = data.accounts.linkedin;

  return (
    <div>
      <SectionLabel>{t("connectedIdentities")}</SectionLabel>
      <p className="text-muted-foreground mt-3 text-sm">
        {t("connectedIdentitiesHelp")}
      </p>

      <div className="mt-4 space-y-3">
        <IdentityRow
          icon={<Github className="h-4 w-4" />}
          title={t("githubIdentity")}
          connected={githubConnected}
          handle={
            data.social.github?.handle ? `@${data.social.github.handle}` : null
          }
          verifiedLabel={t("verified")}
          actionLabel={
            githubConnected ? t("disconnectGithub") : t("connectGithub")
          }
          pending={pending === "github" || disconnect.isPending}
          disabled={githubConnected && !data.canDisconnect.github}
          disabledReason={t("disconnectGithubNeedPassword")}
          onClick={() => {
            if (githubConnected) {
              setPending("github");
              disconnect.mutate({ provider: "github" });
              return;
            }
            void connect("github");
          }}
        />

        {data.linkedinConnectAvailable ? (
          <IdentityRow
            icon={<Linkedin className="h-4 w-4" />}
            title={t("linkedinIdentity")}
            connected={linkedinConnected}
            handle={data.social.linkedin?.handle ?? null}
            verifiedLabel={t("verified")}
            actionLabel={
              linkedinConnected ? t("disconnectLinkedin") : t("connectLinkedin")
            }
            pending={pending === "linkedin" || disconnect.isPending}
            onClick={() => {
              if (linkedinConnected) {
                setPending("linkedin");
                disconnect.mutate({ provider: "linkedin" });
                return;
              }
              void connect("linkedin");
            }}
          />
        ) : (
          <div className="border-border rounded border px-3 py-3">
            <div className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t("linkedinIdentity")}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-xs tracking-wider">
              {t("linkedinNotConfigured")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityRow({
  icon,
  title,
  connected,
  handle,
  verifiedLabel,
  actionLabel,
  pending,
  disabled,
  disabledReason,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  connected: boolean;
  handle: string | null;
  verifiedLabel: string;
  actionLabel: string;
  pending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <div className="border-border flex flex-col gap-3 rounded border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          {connected && (
            <span className="border-border text-foreground inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs tracking-wider uppercase">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              {verifiedLabel}
            </span>
          )}
        </div>
        {handle && (
          <p className="text-muted-foreground mt-1 font-mono text-xs tracking-wider">
            {handle}
          </p>
        )}
        {disabled && disabledReason && (
          <p className="text-muted-foreground mt-1 text-xs">{disabledReason}</p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="font-mono text-xs tracking-wider"
        disabled={pending || disabled}
        onClick={onClick}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
