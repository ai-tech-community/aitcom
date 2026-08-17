"use client";

import { Github, Linkedin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

type SocialOAuthButtonsProps = {
  callbackURL: string;
  linkedinEnabled: boolean;
};

export function SocialOAuthButtons({
  callbackURL,
  linkedinEnabled,
}: SocialOAuthButtonsProps) {
  const t = useTranslations("auth");
  const providers = api.members.getAuthProviders.useQuery(undefined, {
    initialData: { github: true, linkedin: linkedinEnabled },
  });
  const showLinkedin = providers.data?.linkedin ?? linkedinEnabled;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() =>
          authClient.signIn.social({
            provider: "github",
            callbackURL,
          })
        }
      >
        <Github className="h-4 w-4" />
        {t("github")}
      </Button>
      {showLinkedin && (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() =>
            authClient.signIn.social({
              provider: "linkedin",
              callbackURL,
            })
          }
        >
          <Linkedin className="h-4 w-4" />
          {t("linkedin")}
        </Button>
      )}
    </div>
  );
}
