import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { ProfileWork } from "@/server/members/profile-work";
import {
  getMemberWork,
  profileTabMetadata,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { ProfileEmpty } from "@/components/members/profile/profile-empty";
import { toWorkEntries } from "@/components/members/profile/work-entries";
import { WorkEntryList } from "@/components/members/profile/work-entry-list";
import { Button } from "@/components/ui/button";

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return profileTabMetadata({ userId: id, locale, tab: "work" });
}

/**
 * The Work sections, in order, with where an owner starts one. A section
 * without a start page (courses live in a community classroom, certificates
 * are earned, events are organised in a community) teaches in words only.
 */
const WORK_SECTIONS: readonly {
  list: keyof ProfileWork;
  ownerCta?: { href: string; labelKey: string };
}[] = [
  {
    list: "articles",
    ownerCta: { href: "/blog/write", labelKey: "articlesEmptyOwnerCta" },
  },
  {
    list: "projects",
    ownerCta: { href: "/launchpad/new", labelKey: "projectsEmptyOwnerCta" },
  },
  { list: "courses" },
  { list: "certificates" },
  { list: "events" },
];

/** What the member built here, newest first, as this viewer may see it. */
export default async function MemberWorkPage({ params }: { params: Params }) {
  const { id, locale } = await params;
  const [data, work, t] = await Promise.all([
    requireMemberProfile(id),
    getMemberWork(id, locale),
    getTranslations("memberProfile.work"),
  ]);
  if (!work) notFound();
  const isOwner = data.audience === "owner";
  const entries = toWorkEntries(work);

  return (
    <div className="space-y-10">
      {WORK_SECTIONS.map(({ list, ownerCta }) => (
        <DashboardSection
          key={list}
          id={list}
          title={t(list)}
          status={{ kind: entries[list].length > 0 ? "ready" : "empty" }}
          empty={
            <ProfileEmpty
              isOwner={isOwner}
              title={t(`${list}EmptyOwnerTitle`)}
              description={t(`${list}EmptyOwnerDescription`)}
              action={
                ownerCta && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={ownerCta.href}>{t(ownerCta.labelKey)}</Link>
                  </Button>
                )
              }
              visitorText={t(`${list}EmptyVisitor`)}
            />
          }
          footer={
            work[list].hasMore ? (
              <p className="text-muted-foreground mt-2 text-xs">
                {t("showingLatest", { count: work[list].items.length })}
              </p>
            ) : undefined
          }
        >
          <WorkEntryList entries={entries[list]} />
        </DashboardSection>
      ))}
    </div>
  );
}
