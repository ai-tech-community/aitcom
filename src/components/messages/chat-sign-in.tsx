"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/server/better-auth/client";
import {
  useInitialAuthUser,
  usePageDocumentAuthUser,
} from "@/components/auth/session-provider";
import { documentAuthUser } from "@/server/better-auth/hub-session";
import { MessageSquareIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function useChatAccess() {
  const initialUser = useInitialAuthUser();
  const pageUser = usePageDocumentAuthUser();
  const { data: session, isPending } = authClient.useSession();
  // A client session can settle before a route hydrates. Use the document
  // seed for the first render so the auth gate matches the server markup.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return {
    user: documentAuthUser(
      initialUser,
      pageUser,
      hydrated ? session?.user : null,
    ),
    pending: !hydrated || isPending,
  };
}

export function ChatSignIn({
  redirect,
  room = false,
}: {
  redirect: string;
  room?: boolean;
}) {
  const t = useTranslations("redesign.chat");
  const locale = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-6 py-14 sm:py-20">
      <MessageSquareIcon aria-hidden className="text-muted-foreground size-6" />
      <h1 className="text-2xl font-semibold tracking-tight">
        {t(room ? "signInRoom" : "signInMessages")}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {t(room ? "signInRoomHint" : "signInMessagesHint")}
      </p>
      <Button asChild className="min-h-11">
        <Link
          href={{
            pathname: "/auth/signin",
            query: { redirect: `/${locale}${redirect}` },
          }}
        >
          {t("signIn")}
        </Link>
      </Button>
    </div>
  );
}
