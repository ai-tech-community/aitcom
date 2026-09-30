"use client";

import { useTranslations } from "next-intl";

import { OAuthProviderIcon } from "@/components/auth/oauth-provider-icon";
import { Button } from "@/components/ui/button";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-providers";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

type SocialOAuthButtonsProps = {
  callbackURL: string;
  /** Request-time snapshot from the page, used until the query settles. */
  enabledProviders: Record<OAuthProvider, boolean>;
};

export function SocialOAuthButtons({
  callbackURL,
  enabledProviders,
}: SocialOAuthButtonsProps) {
  const t = useTranslations("auth");
  const providers = api.members.getAuthProviders.useQuery(undefined, {
    initialData: enabledProviders,
  });
  const enabled = providers.data ?? enabledProviders;

  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.filter((provider) => enabled[provider]).map(
        (provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() =>
              authClient.signIn.social({
                provider,
                callbackURL,
              })
            }
          >
            <OAuthProviderIcon provider={provider} />
            {t(provider)}
          </Button>
        ),
      )}
    </div>
  );
}
