"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import { OAuthProviderIcon } from "@/components/auth/oauth-provider-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DashboardSection,
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { ListSkeleton } from "@/components/dashboard/list-skeleton";
import { oauthErrorCallbackURL, oauthErrorMessageKey } from "@/lib/auth-errors";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-providers";
import { isSocialProvider } from "@/lib/social-identity";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

const COPY_KEYS: Record<OAuthProvider, { title: string; connect: string }> = {
  google: { title: "googleIdentity", connect: "connectGoogle" },
  github: { title: "githubIdentity", connect: "connectGithub" },
  linkedin: { title: "linkedinIdentity", connect: "connectLinkedin" },
};

/**
 * The Settings tab's sign-in identities: connect or disconnect Google,
 * GitHub and LinkedIn. GitHub and LinkedIn also verify the profile links.
 */
export function ConnectedIdentities() {
  const t = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A failed connect comes back to Settings with ?error=<code>.
  const linkErrorKey = oauthErrorMessageKey(searchParams.get("error"));
  const utils = api.useUtils();
  const profile = api.members.getMyProfile.useQuery();
  const providers = api.members.getAuthProviders.useQuery();
  const data = profile.data;
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const disconnect = api.members.disconnectSocial.useMutation({
    onSuccess: async () => {
      toast.success(t("socialDisconnected"));
      await utils.members.getMyProfile.invalidate();
    },
    onError: () => {
      toast.error(t("socialDisconnectError"));
    },
    onSettled: () => setPending(null),
  });

  async function connect(provider: OAuthProvider) {
    setPending(provider);
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL: pathname,
      errorCallbackURL: oauthErrorCallbackURL(pathname, searchParams),
    });
    if (error) {
      toast.error(t("socialConnectError"));
      setPending(null);
    }
  }

  const handles: Record<OAuthProvider, string | null> = {
    google: null,
    github: data?.social.github?.handle
      ? `@${data.social.github.handle}`
      : null,
    linkedin: data?.social.linkedin?.handle ?? null,
  };

  // A connected provider stays listed even if its keys are later removed (or
  // the enabled-provider list fails to load), so the member can still
  // disconnect it.
  const visible = data
    ? OAUTH_PROVIDERS.filter(
        (provider) => data.accounts[provider] || providers.data?.[provider],
      )
    : [];

  return (
    <DashboardSection
      title={t("connectedIdentities")}
      status={statusFromQueries(profile)}
      skeleton={<ListSkeleton rows={2} />}
    >
      <p className="text-muted-foreground max-w-prose text-sm text-pretty">
        {t("connectedIdentitiesHelp")}
      </p>
      {linkErrorKey && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {tAuth(linkErrorKey)}
        </p>
      )}

      <ul className="divide-border mt-2 divide-y">
        {data &&
          visible.map((provider) => {
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
      </ul>
      {/* Which providers can be connected; a failure only hides those rows. */}
      <SectionBody status={statusFromQueries(providers)} size="compact" />
    </DashboardSection>
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
    <li
      data-slot="identity-row"
      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          {connected && (
            <Badge variant="outline">
              {verified && <BadgeCheck aria-hidden="true" />}
              {connectedLabel}
            </Badge>
          )}
        </div>
        {handle && (
          <p className="text-muted-foreground mt-1 font-mono text-xs">
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
        className="w-fit"
        disabled={pending || disabled}
        onClick={onClick}
      >
        {actionLabel}
      </Button>
    </li>
  );
}
