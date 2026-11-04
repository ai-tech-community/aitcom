import { resolveLocale } from "@/i18n/messages";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsSubmissionPage } from "@/components/investigations/startups-submission-page";
import {
  STARTUPS_CLAIM_PATH,
  STARTUPS_PATH,
  buildStartupClaimPath,
  buildStartupProfilePath,
  parseStartupSlug,
  startupCardWithClaimDraft,
  type StartupClaimStatus,
} from "@/lib/investigations/startups";
import { localeAlternates } from "@/lib/metadata";
import { userIsHubOperator } from "@/server/awesome-ai-oss/operator";
import { getSession } from "@/server/better-auth/server";
import {
  findApprovedPublicStartupBySlug,
  findStartupClaimReview,
} from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ slug?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("investigationsStartups");
  return {
    title: t("claimTitle"),
    description: t("claimHelp"),
    robots: { index: false, follow: true },
    alternates: await localeAlternates(STARTUPS_CLAIM_PATH),
  };
}

export default async function StartupClaimPage({ searchParams }: PageProps) {
  const locale = await getLocale();
  const raw = await searchParams;
  const slug = parseStartupSlug(firstParam(raw.slug));
  const session = await getSession();
  const viewerId = session?.user.id ?? null;
  const isModerator = viewerId ? await userIsHubOperator(viewerId) : false;
  const listed = slug ? await findApprovedPublicStartupBySlug(slug) : null;
  const review = listed ? await findStartupClaimReview(listed.slug) : null;
  const mine = viewerId != null && review?.claimedByUserId === viewerId;
  const card =
    listed && review?.draft && (isModerator || mine)
      ? startupCardWithClaimDraft(listed, review.draft)
      : listed;

  let claimNotice: "pending" | "waiting" | "taken" | null = null;
  if (review?.claimStatus === "approved" && review.claimedByUserId && !mine) {
    claimNotice = "taken";
  } else if (
    review?.claimStatus === "pending" &&
    review.claimedByUserId &&
    !mine &&
    !isModerator
  ) {
    claimNotice = "waiting";
  } else if (review?.claimStatus === "pending" && (mine || isModerator)) {
    claimNotice = "pending";
  }

  const claimStatus: StartupClaimStatus | null =
    isModerator || mine ? (review?.claimStatus ?? null) : null;
  const returnPath = listed
    ? buildStartupClaimPath(listed.slug)
    : STARTUPS_CLAIM_PATH;
  const signInHref = `/${locale}/auth/signin?redirect=${encodeURIComponent(`/${locale}${returnPath}`)}`;
  const closeHref = `/${locale}${listed ? buildStartupProfilePath(listed.slug) : STARTUPS_PATH}`;

  return (
    <StartupsSubmissionPage
      mode="claim"
      locale={resolveLocale(locale)}
      card={card}
      claimStatus={claimStatus}
      claimNotice={claimNotice}
      isModerator={isModerator}
      signedIn={viewerId != null}
      signInHref={signInHref}
      closeHref={closeHref}
    />
  );
}
