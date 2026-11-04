"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { StartupsSubmitDialog } from "@/components/investigations/startups-submit-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  STARTUPS_PATH,
  type StartupClaimStatus,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

/**
 * The add-startup dialog on its own URL. Claim opens it on one listed
 * company. Submit opens it blank. Closing returns to the profile or directory.
 */
export function StartupsSubmissionPage({
  mode,
  locale,
  card,
  claimStatus = null,
  claimNotice = null,
  isModerator,
  signedIn,
  signInHref,
  closeHref,
}: {
  mode: "claim" | "submit";
  locale: StartupLocale;
  card: StartupPublicCard | null;
  claimStatus?: StartupClaimStatus | null;
  claimNotice?: "pending" | "waiting" | "taken" | null;
  isModerator: boolean;
  signedIn: boolean;
  signInHref: string;
  closeHref: string;
}) {
  const t = useTranslations("investigationsStartups");
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const missingClaim = mode === "claim" && !card;
  const claiming = mode === "claim";

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">{t("kicker")}</SectionLabel>
      <div className="mt-6 flex max-w-2xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {claiming ? t("claimTitle") : t("submitTitle")}
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          {claiming ? t("claimHelp") : t("submitHelp")}
        </p>
      </div>
      {missingClaim ? (
        <EmptyState
          className="mt-10"
          title={t("claimMissing")}
          description={t("claimMissingHelp")}
          action={
            <Button asChild variant="outline">
              <Link href={STARTUPS_PATH}>{t("profileBack")}</Link>
            </Button>
          }
        />
      ) : (
        <StartupsSubmitDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) router.push(closeHref);
          }}
          locale={locale}
          editing={claiming ? card : null}
          intent={claiming ? "claim" : "create"}
          isModerator={isModerator}
          signedIn={signedIn}
          signInHref={signInHref}
          claimStatus={claimStatus}
          claimNotice={claimNotice}
          copy={{
            title: t("submitTitle"),
            editTitle: claiming ? t("claimTitle") : t("editTitle"),
            help: claiming ? t("claimHelp") : t("submitHelp"),
            fieldName: t("fieldName"),
            fieldHomepage: t("fieldHomepage"),
            fieldCategory: t("fieldCategory"),
            fieldSources: t("fieldSources"),
            fieldSourcesHint: t("fieldSourcesHint"),
            fieldRegion: t("fieldRegion"),
            fieldLat: t("fieldLat"),
            fieldLng: t("fieldLng"),
            fieldStage: t("fieldStage"),
            fieldDescription: t("fieldDescription"),
            fieldLogo: t("fieldLogo"),
            fieldFounders: t("fieldFounders"),
            fieldFoundersHint: t("fieldFoundersHint"),
            fieldInvestors: t("fieldInvestors"),
            fieldInvestorsHint: t("fieldInvestorsHint"),
            fieldExit: t("fieldExit"),
            fieldExitNone: t("fieldExitNone"),
            fieldAcquirer: t("fieldAcquirer"),
            fieldExitOn: t("fieldExitOn"),
            fieldJobs: t("fieldJobs"),
            fieldUsesAi: t("fieldUsesAi"),
            fieldUsesAiUnknown: t("fieldUsesAiUnknown"),
            fieldUsesAiYes: t("fieldUsesAiYes"),
            fieldUsesAiNo: t("fieldUsesAiNo"),
            submit: t("submit"),
            save: t("save"),
            cancel: t("cancel"),
            success: t("submitSuccess"),
            updateSuccess: t("updateSuccess"),
            claimSubmit: t("claimSubmit"),
            claimSuccess: t("claimSuccess"),
            submitPendingSuccess: t("submitPendingSuccess"),
            approveClaim: t("approveClaim"),
            claimApproved: t("claimApproved"),
            claimPending: t("claimPending"),
            claimWaiting: t("claimWaiting"),
            claimTaken: t("claimTaken"),
            signInToContinue: t("signInToContinue"),
          }}
        />
      )}
    </main>
  );
}
