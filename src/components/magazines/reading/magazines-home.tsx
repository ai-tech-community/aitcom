import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  MAGAZINES_HOME_PATH,
  magazinePath,
  magazinesTopicPath,
} from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type {
  MagazineCard,
  MagazinesHomeData,
} from "@/server/magazines/reading";

import { FeaturedIssue } from "./featured-issue";
import { READING_FRAME } from "./frame";
import { IssueCoverArt, IssueCoverCard } from "./issue-cover-card";
import { useIssueDateline } from "./issue-dateline";

function TopicChips({
  topics,
  activeTopic,
}: {
  topics: string[];
  activeTopic: string | null;
}) {
  const t = useTranslations("magazines.home");
  // A topic reached by link (a shelf's topic) may not be among the most
  // common ones; it still shows, marked, so the reader sees the filter.
  const shown =
    activeTopic && !topics.includes(activeTopic)
      ? [...topics, activeTopic]
      : topics;
  const chips: { topic: string | null; label: string }[] = [
    { topic: null, label: t("allTopics") },
    ...shown.map((topic) => ({ topic, label: topic })),
  ];
  return (
    <nav aria-label={t("topicFilter")}>
      <ul className="flex flex-wrap gap-2">
        {chips.map(({ topic, label }) => {
          const active = topic === activeTopic;
          return (
            <li key={topic ?? ""}>
              <Link
                href={magazinesTopicPath(topic)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** One magazine on the home: its newest public issue's cover, name and community. */
function MagazineTile({ magazine }: { magazine: MagazineCard }) {
  const dateline = useIssueDateline(magazine.latest);
  return (
    <Link
      href={magazinePath(magazine)}
      className="group flex min-w-0 flex-col gap-2"
    >
      <IssueCoverArt issue={magazine.latest} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm leading-snug font-semibold break-words underline-offset-4 group-hover:underline">
          {magazine.name}
        </span>
        <span className="text-muted-foreground text-sm break-words">
          {magazine.community.name}
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          {dateline}
        </span>
      </span>
    </Link>
  );
}

function AllMagazines({
  data,
  activeTopic,
}: {
  data: MagazinesHomeData;
  activeTopic: string | null;
}) {
  const t = useTranslations("magazines.home");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {t("allMagazines")}
        </h2>
        <TopicChips topics={data.topics} activeTopic={activeTopic} />
      </div>
      {data.magazines.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {data.magazines.map((magazine) => (
            <li key={magazine.id} className="min-w-0">
              <MagazineTile magazine={magazine} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t("noTopicTitle", { topic: activeTopic ?? "" })}
          description={t("noTopicDescription")}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={MAGAZINES_HOME_PATH}>{t("showAll")}</Link>
            </Button>
          }
        />
      )}
    </section>
  );
}

/**
 * The `/magazines` home (mockup screen 1): the featured issue beside
 * "Just published", then every magazine with a public issue, filtered by
 * topic chips (links with `?topic=`). Only public issues reach this page
 * (Decision 10). With nothing public yet it explains what magazines are
 * and points to the communities that make them.
 */
export function MagazinesHome({
  data,
  activeTopic,
}: {
  data: MagazinesHomeData;
  /** The normalised `?topic=`, or null for every magazine. */
  activeTopic: string | null;
}) {
  const t = useTranslations("magazines.home");
  const featuredId = useId();
  const justPublishedId = useId();

  // The read model features the newest issue with a cover; when no issue
  // has one, the newest issue leads anyway (its cover is the typeset
  // stand-in), so the page always opens on an issue.
  const featured = data.featured ?? data.justPublished[0] ?? null;
  const justPublished = data.featured
    ? data.justPublished
    : data.justPublished.slice(1);
  const isEmpty = featured === null && data.magazines.length === 0;

  return (
    <div className={cn(READING_FRAME, "flex flex-col gap-10")}>
      <header className="flex max-w-3xl flex-col gap-3">
        <SectionLabel as="p" bordered={false}>
          {t("label")}
        </SectionLabel>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-base">{t("intro")}</p>
      </header>

      {isEmpty ? (
        <EmptyState
          className="rounded-xl border"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button variant="ink" size="sm" asChild>
              <Link href="/communities">{t("emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          {featured && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section aria-labelledby={featuredId} className="min-w-0">
                <FeaturedIssue issue={featured} labelId={featuredId} />
              </section>
              {justPublished.length > 0 && (
                <section
                  aria-labelledby={justPublishedId}
                  className="flex min-w-0 flex-col gap-4"
                >
                  <SectionLabel id={justPublishedId}>
                    {t("justPublished")}
                  </SectionLabel>
                  <ul className="flex flex-col gap-5">
                    {justPublished.map((issue) => (
                      <li key={issue.id} className="min-w-0">
                        <IssueCoverCard
                          issue={issue}
                          variant="row"
                          showMagazine
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          <AllMagazines data={data} activeTopic={activeTopic} />
        </>
      )}
    </div>
  );
}
