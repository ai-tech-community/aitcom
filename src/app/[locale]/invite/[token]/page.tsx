import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { loadInviteLanding } from "@/server/communities/referral-email/landing";
import { inviteAttributionSearch } from "@/lib/referral-invites";

import { invitePageMetadata } from "@/lib/invite-metadata";
import { getSession } from "@/server/better-auth/server";

import { RedeemInviteClient } from "./redeem-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}): Promise<Metadata> {
  const { token, locale } = await params;
  return invitePageMetadata(locale, token);
}

export default async function RedeemInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, locale } = await params;
  const query = await searchParams;
  const attribution = inviteAttributionSearch(query);
  const t = await getTranslations("referral.guest");
  const session = await getSession();
  const landing = await loadInviteLanding(db, token, session?.user?.id);
  if (landing.kind !== "valid")
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Link2 className="text-muted-foreground size-8" aria-hidden="true" />
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(landing.kind === "expired" ? "expiredTitle" : "invalidTitle")}
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          {t("unavailableBody")}
        </p>
        <Button asChild>
          <Link href="/communities">
            {t("explore")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </main>
    );
  const callbackQuery = new URLSearchParams(attribution);
  callbackQuery.set("accept", "1");
  const callback = `/${locale}/invite/${encodeURIComponent(token)}?${callbackQuery}`;
  const startQuery = new URLSearchParams(attribution);
  startQuery.set("code", token);
  startQuery.set("locale", locale);
  const signup = `/api/referral-invites/start?${startQuery}&mode=signup`;
  const signin = `/api/referral-invites/start?${startQuery}&mode=signin`;
  if (query.accept === "1") {
    if (!session?.user) redirect(signup);
    return <RedeemInviteClient token={token} attribution={attribution} />;
  }
  const name = landing.inviterName?.trim() || t("member");
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
        <section>
          <div className="mb-7 flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{name}</p>
              <p className="text-muted-foreground text-xs">
                {t(landing.inviterName ? "personal" : "welcome")}
              </p>
            </div>
          </div>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {t(landing.inviterName ? "title" : "communityTitle", {
              name,
              community: landing.communityName,
            })}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-prose text-base leading-relaxed">
            {t("body")}
          </p>
          <div className="my-7 border-b pb-6">
            <h2 className="text-base font-semibold">{landing.communityName}</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {t("communityBody")}
            </p>
          </div>
          {landing.alreadyMember ? (
            <>
              <p className="mb-4 text-sm">{t("alreadyMember")}</p>
              <Button asChild className="text-foreground min-h-11">
                <Link href={`/communities/${landing.communitySlug}`}>
                  {t("open", { community: landing.communityName })}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild
                className="text-foreground min-h-11 w-full sm:w-auto"
              >
                <NextLink
                  prefetch={false}
                  href={session?.user ? callback : signup}
                >
                  {t("join", { community: landing.communityName })}
                  <ArrowRight className="size-4" />
                </NextLink>
              </Button>
              {!session?.user && (
                <p className="text-muted-foreground mt-4 text-sm">
                  {t("haveAccount")}{" "}
                  <a
                    href={signin}
                    className="text-foreground underline underline-offset-4"
                  >
                    {t("signin")}
                  </a>
                </p>
              )}
            </>
          )}
          <p className="text-muted-foreground mt-7 text-xs">{t("preserved")}</p>
        </section>
        <div>
          <Image
            src="/images/isometric-illustrated-town-square.png"
            width={1024}
            height={1024}
            priority
            alt=""
            className="h-auto w-full"
          />
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {t("tagline")}
          </p>
        </div>
      </div>
    </main>
  );
}
