"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AwesomeAiOssCard } from "@/components/investigations/awesome-ai-oss-card";
import { AwesomeAiOssPagination } from "@/components/investigations/awesome-ai-oss-pagination";
import { AwesomeAiOssSubmitDialog } from "@/components/investigations/awesome-ai-oss-submit-dialog";
import {
  AWESOME_AI_OSS_REVIEW_PATH,
  AWESOME_CATEGORY_IDS,
  AWESOME_CATEGORY_LABELS,
  applyAwesomeDirectoryQuery,
  buildAwesomeDirectoryPath,
  paginateAwesomeCards,
  parseAwesomeDirectoryQuery,
  type AwesomeCategoryId,
  type AwesomeDirectoryQuery,
  type AwesomeLocale,
  type AwesomePublicCard,
  type AwesomeSort,
} from "@/lib/investigations/awesome-ai-oss";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";

export function AwesomeAiOssDirectory({
  projects,
  signedIn,
  isModerator,
  locale,
  initialQuery,
  signInHref,
}: {
  projects: AwesomePublicCard[];
  signedIn: boolean;
  isModerator: boolean;
  locale: AwesomeLocale;
  initialQuery: AwesomeDirectoryQuery;
  signInHref: string;
}) {
  const t = useTranslations("investigationsAwesomeAiOss");
  const router = useRouter();
  const pathname = usePathname();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [query, setQuery] = useState(() =>
    parseAwesomeDirectoryQuery(initialQuery, signedIn),
  );

  useEffect(() => {
    setQuery((current) =>
      current.page === initialQuery.page
        ? current
        : { ...current, page: initialQuery.page },
    );
  }, [initialQuery.page]);

  const sessionQuery = api.awesomeAiOss.sessionState.useQuery(undefined, {
    enabled: signedIn,
  });
  const utils = api.useUtils();

  const vote = api.awesomeAiOss.vote.useMutation({
    onSuccess: async () => {
      await utils.awesomeAiOss.sessionState.invalidate();
    },
  });
  const save = api.awesomeAiOss.save.useMutation({
    onSuccess: async () => {
      await utils.awesomeAiOss.sessionState.invalidate();
    },
  });

  const voteCounts = signedIn ? sessionQuery.data?.voteCounts : undefined;
  const filtered = useMemo(
    () => applyAwesomeDirectoryQuery(projects, query, locale, voteCounts),
    [projects, query, locale, voteCounts],
  );
  const pagination = useMemo(
    () => paginateAwesomeCards(filtered, query.page),
    [filtered, query.page],
  );
  const visible = pagination.items;

  function replaceQuery(next: Partial<AwesomeDirectoryQuery>) {
    const filterChanged =
      next.q !== undefined ||
      next.category !== undefined ||
      next.sort !== undefined;
    const merged = parseAwesomeDirectoryQuery(
      {
        ...query,
        ...next,
        page: next.page ?? (filterChanged ? 1 : query.page),
      },
      signedIn,
    );
    setQuery(merged);
    const path = buildAwesomeDirectoryPath(merged, { signedIn });
    const qs = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const cardCopy = {
    openRepo: t("openRepo"),
    vote: t("vote"),
    voted: t("voted"),
    removeVote: t("removeVote"),
    voteTooltip: t("voteTooltip"),
    save: t("save"),
    saved: t("saved"),
    starTooltip: t("starTooltip"),
    learnMore: t("learnMore"),
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="awesome-search" className="sr-only">
              {t("searchPlaceholder")}
            </Label>
            <Input
              id="awesome-search"
              value={query.q}
              placeholder={t("searchPlaceholder")}
              onChange={(event) => replaceQuery({ q: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-filter" className="sr-only">
              {t("filterLabel")}
            </Label>
            <Select
              value={query.category}
              onValueChange={(value) =>
                replaceQuery({
                  category: value as AwesomeCategoryId | "all",
                })
              }
            >
              <SelectTrigger id="awesome-filter" className="w-full min-w-56">
                <SelectValue placeholder={t("filterLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterLabel")}</SelectItem>
                  {AWESOME_CATEGORY_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {AWESOME_CATEGORY_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="awesome-sort" className="sr-only">
              {t("sortNewest")}
            </Label>
            <Select
              value={query.sort}
              onValueChange={(value) =>
                replaceQuery({ sort: value as AwesomeSort })
              }
            >
              <SelectTrigger id="awesome-sort" className="w-full min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="newest">{t("sortNewest")}</SelectItem>
                  {signedIn ? (
                    <SelectItem value="voted">{t("sortVoted")}</SelectItem>
                  ) : null}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {signedIn ? (
            <Button type="button" onClick={() => setSubmitOpen(true)}>
              {t("submitProject")}
            </Button>
          ) : (
            <Button asChild>
              <a href={signInHref}>{t("signInCta")}</a>
            </Button>
          )}
        </div>

        {isModerator ? (
          <p className="text-sm">
            <Link
              href={AWESOME_AI_OSS_REVIEW_PATH}
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("queueTitle")}
            </Link>
          </p>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((card) => (
              <li key={card.id} id={card.id}>
                <AwesomeAiOssCard
                  card={card}
                  locale={locale}
                  signedIn={signedIn}
                  session={
                    signedIn
                      ? {
                          voteCount: sessionQuery.data?.voteCounts[card.id],
                          voted: sessionQuery.data?.votedIds.includes(card.id),
                          saved: sessionQuery.data?.savedIds.includes(card.id),
                        }
                      : undefined
                  }
                  copy={cardCopy}
                  onVote={(projectId) => vote.mutate({ projectId })}
                  onSave={(projectId) => save.mutate({ projectId })}
                />
              </li>
            ))}
          </ul>
        )}

        <AwesomeAiOssPagination
          query={{ ...query, page: pagination.page }}
          totalPages={pagination.totalPages}
          signedIn={signedIn}
          prevLabel={t("paginationPrev")}
          nextLabel={t("paginationNext")}
          navLabel={t("paginationLabel")}
        />
      </div>

      {signedIn ? (
        <AwesomeAiOssSubmitDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          locale={locale}
          copy={{
            title: t("submitTitle"),
            help: t("submitHelp"),
            fieldName: t("fieldName"),
            fieldRepo: t("fieldRepo"),
            fieldCategory: t("fieldCategory"),
            fieldBlurb: t("fieldBlurb"),
            fieldBlurbHint: t("fieldBlurbHint"),
            fieldNote: t("fieldNote"),
            submitForReview: t("submitForReview"),
            cancel: t("cancel"),
            submitSuccess: t("submitSuccess"),
          }}
        />
      ) : null}
    </TooltipProvider>
  );
}
