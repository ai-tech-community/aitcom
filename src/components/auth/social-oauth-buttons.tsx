"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { OAuthProviderIcon } from "@/components/auth/oauth-provider-icon";
import { Button } from "@/components/ui/button";
import { oauthErrorCallbackURL, oauthErrorMessageKey } from "@/lib/auth-errors";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const [requestFailed, setRequestFailed] = useState(false);
  // A failed sign-in comes back to this page with ?error=<code>.
  const errorKey = pendingProvider
    ? null
    : requestFailed
      ? "oauthFailed"
      : oauthErrorMessageKey(searchParams.get("error"));
  const errorCallbackURL = oauthErrorCallbackURL(pathname, searchParams);
  const providers = api.members.getAuthProviders.useQuery(undefined, {
    initialData: enabledProviders,
  });
  const enabled = providers.data ?? enabledProviders;

  useEffect(() => {
    // Back from the provider can restore this page with its busy state intact.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setPendingProvider(null);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function handleSignIn(provider: OAuthProvider) {
    if (pendingProvider) return;
    setPendingProvider(provider);
    setRequestFailed(false);

    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL,
      });
      if (!error) {
        // Better Auth starts navigation itself. Stay busy until the browser
        // leaves, including the time spent loading the provider's page.
        return;
      }
    } catch {
      // Network failures can throw instead of returning an auth error.
    }

    setRequestFailed(true);
    setPendingProvider(null);
  }

  return (
    <div className="space-y-2">
      <span role="status" className="sr-only">
        {pendingProvider ? t("signingIn") : ""}
      </span>
      {errorKey && (
        <p role="alert" className="text-destructive text-sm">
          {t(errorKey)}
        </p>
      )}
      {OAUTH_PROVIDERS.filter((provider) => enabled[provider]).map(
        (provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={pendingProvider !== null}
            aria-busy={pendingProvider === provider}
            onClick={() => handleSignIn(provider)}
          >
            {pendingProvider === provider ? (
              <Loader2Icon
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <OAuthProviderIcon provider={provider} />
            )}
            {pendingProvider === provider ? t("signingIn") : t(provider)}
          </Button>
        ),
      )}
    </div>
  );
}
