"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import { OAuthProviderIcon } from "@/components/auth/oauth-provider-icon";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-providers";
import { isSocialProvider } from "@/lib/social-identity";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

const COPY_KEYS: Record<OAuthProvider, { title: string; connect: string }> = {
  google: { title: "googleIdentity", connect: "connectGoogle" },
  github: { title: "githubIdentity", connect: "connectGithub" },
  linkedin: { title: "linkedinIdentity", connect: "connectLinkedin" },
};

export function ConnectedIdentities() {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const utils = api.useUtils();
  const { data, isLoading } = api.members.getMyProfile.useQuery();
  const providers = api.members.getAuthProviders.useQuery();
  const [pending, setPending] = useState<OAuthProvider | null>(null);

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

  async function connect(provider: OAuthProvider) {
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

  const handles: Record<OAuthProvider, string | null> = {
    google: null,
    github: data.social.github?.handle ? `@${data.social.github.handle}` : null,
    linkedin: data.social.linkedin?.handle ?? null,
  };

  // A connected provider stays listed even if its keys are later removed, so
  // the member can still disconnect it.
  const visible = OAUTH_PROVIDERS.filter(
    (provider) => data.accounts[provider] || providers.data?.[provider],
  );

  return (
    <div>
      <SectionLabel>{t("connectedIdentities")}</SectionLabel>
      <p className="text-muted-foreground mt-3 text-sm">
        {t("connectedIdentitiesHelp")}
      </p>

      <div className="mt-4 space-y-3">
        {visible.map((provider) => {
          const connected = data.accounts[provider];
          return (
            <IdentityRow
              key={provider}
              icon={<OAuthProviderIcon provider={provider} />}
              title={t(COPY_KEYS[provider].title)}
              connected={connected}
              handle={handles[provider]}
              verified={isSocialProvider(provider)}
              connectedLabel={
                isSocialProvider(provider) ? t("verified") : t("connected")
              }
              actionLabel={
                connected ? t("disconnect") : t(COPY_KEYS[provider].connect)
              }
              pending={pending === provider || disconnect.isPending}
              disabled={connected && !data.canDisconnect[provider]}
              disabledReason={t("disconnectNeedAnotherSignIn")}
              onClick={() => {
                if (connected) {
                  setPending(provider);
                  disconnect.mutate({ provider });
                  return;
                }
                void connect(provider);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function IdentityRow({
  icon,
  title,
  connected,
  handle,
  verified,
  connectedLabel,
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
  /** Verified identities get the check mark; sign-in-only ones do not. */
  verified: boolean;
  connectedLabel: string;
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
              {verified && (
                <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              )}
              {connectedLabel}
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
