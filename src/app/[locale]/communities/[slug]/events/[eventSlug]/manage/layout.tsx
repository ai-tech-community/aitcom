import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { loadManageData } from "@/server/hackathon/load-manage";
import { ManageTabBar } from "@/components/hackathon/manage/manage-tab-bar";
import { ManagePhaseTracker } from "@/components/hackathon/manage/manage-phase-tracker";
import { Badge } from "@/components/ui/badge";

const PHASE_LABEL_KEY = {
  draft: "statusDraft",
  live: "statusLive",
  locked: "statusLocked",
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

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
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
          <Badge variant={isDraft ? "outline" : "secondary"}>
            {t(PHASE_LABEL_KEY[data.phase])}
          </Badge>
        </div>
      </div>

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
