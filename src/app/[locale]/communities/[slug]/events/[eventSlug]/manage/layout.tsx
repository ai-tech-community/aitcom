import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { EventHeading } from "@/components/events/detail/event-heading";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

import { loadManageData } from "@/server/hackathon/load-manage";
import { ManageTabBar } from "@/components/hackathon/manage/manage-tab-bar";
import { ManagePhaseTracker } from "@/components/hackathon/manage/manage-phase-tracker";
import { Badge } from "@/components/ui/badge";

const PHASE_LABEL_KEY = {
  draft: "statusDraft",
  live: "statusLive",
  locked: "statusLocked",
  judging: "statusJudging",
  finalized: "statusFinalized",
} as const;

export default async function ManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  // Enforces the admin gate + scopes to this community (redirects/404s as before).
  const data = await loadManageData(slug, eventSlug);
  const t = await getTranslations("hackathon");
  const isDraft = data.phase === "draft";
  const redesign = isOpenCommunitiesEnabled();
  const status = (
    <Badge variant={isDraft ? "outline" : "secondary"}>
      {t(PHASE_LABEL_KEY[data.phase])}
    </Badge>
  );

  return (
    <section
      className={cn(
        "mx-auto space-y-6",
        redesign ? "max-w-5xl py-2" : "max-w-3xl p-4",
      )}
    >
      {redesign ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Button asChild variant="ghost" className="-ml-3 min-h-11">
              <Link href={`/communities/${data.communitySlug}/events`}>
                <ArrowLeft aria-hidden="true" />
                {data.communitySlug}
              </Link>
            </Button>
            {!isDraft ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link
                  href={`/events/${data.eventSlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("viewPublicPage")}
                </Link>
              </Button>
            ) : null}
          </div>
          <EventHeading title={data.name || t("createTitle")} labels={status} />
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/communities/${data.communitySlug}/events`}
              className="text-muted-foreground text-sm hover:underline"
            >
              ← {data.communitySlug}
            </Link>
            <h1 className="truncate text-xl font-semibold">
              {data.name || t("createTitle")}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isDraft ? (
              <Link
                href={`/events/${data.eventSlug}`}
                className="text-sm hover:underline"
                target="_blank"
              >
                {t("viewPublicPage")}
              </Link>
            ) : null}
            {status}
          </div>
        </div>
      )}

      <ManagePhaseTracker phase={data.phase} />

      <ManageTabBar
        communitySlug={data.communitySlug}
        eventSlug={data.eventSlug}
        labels={{
          setup: t("manageTabSetup"),
          tasks: t("manageTabTasks"),
          analytics: t("manageTabAnalytics"),
          lifecycle: t("manageTabLifecycle"),
        }}
      />

      <div>{children}</div>
    </section>
  );
}
