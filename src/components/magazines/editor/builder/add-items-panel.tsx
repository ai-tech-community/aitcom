"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type RouterOutputs } from "@/trpc/react";

import { articleReference } from "./items/article";

/** A ready article "Add more" offers. */
export type AddableArticle =
  RouterOutputs["magazines"]["availableArticles"][number];

/**
 * "Add more": what an editor can put in the issue. This slice has two
 * tabs: the magazine's articles that are ready and in no issue yet, and an
 * editorial block of the editor's own text. Articles already in this issue
 * are not offered again.
 */
export function AddItemsPanel({
  communitySlug,
  referencesInIssue,
  onAddArticle,
  onAddEditorial,
}: {
  communitySlug: string;
  /** What the issue already references (`builderReferenceKey`). */
  referencesInIssue: ReadonlySet<string>;
  onAddArticle: (article: AddableArticle) => void;
  onAddEditorial: () => void;
}) {
  const t = useTranslations("magazineEditor.builder.add");
  const labelId = useId();

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-3">
      <SectionLabel id={labelId}>{t("label")}</SectionLabel>
      <Tabs defaultValue="articles">
        <TabsList aria-label={t("kind")} className="self-start">
          <TabsTrigger value="articles">{t("articles")}</TabsTrigger>
          <TabsTrigger value="editorial">{t("editorial")}</TabsTrigger>
        </TabsList>
        <TabsContent value="articles">
          <ReadyArticles
            communitySlug={communitySlug}
            referencesInIssue={referencesInIssue}
            onAdd={onAddArticle}
          />
        </TabsContent>
        <TabsContent value="editorial" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{t("editorialHint")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onAddEditorial}
          >
            <Plus aria-hidden="true" />
            {t("addEditorial")}
          </Button>
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** Where focus goes after an article is added: an Add button, or the empty text. */
type FocusTarget = { articleId: number } | "empty";

/**
 * The ready articles not in the issue yet. An added article leaves the
 * list and takes its Add button with it, so the list moves focus on
 * (WCAG 2.4.3): the next article's Add button, else the previous one's,
 * else the empty-list text.
 */
function ReadyArticles({
  communitySlug,
  referencesInIssue,
  onAdd,
}: {
  communitySlug: string;
  referencesInIssue: ReadonlySet<string>;
  onAdd: (article: AddableArticle) => void;
}) {
  const t = useTranslations("magazineEditor.builder.add");
  const query = api.magazines.availableArticles.useQuery({
    slug: communitySlug,
  });
  const addButtons = useRef(new Map<number, HTMLButtonElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const offered = (query.data ?? []).filter(
    (a) => !referencesInIssue.has(articleReference(a.id)),
  );

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "empty") emptyRef.current?.focus();
    else addButtons.current.get(target.articleId)?.focus();
  }, [referencesInIssue]);

  const add = (index: number) => {
    const next = offered[index + 1] ?? offered[index - 1];
    pendingFocus.current = next ? { articleId: next.id } : "empty";
    onAdd(offered[index]!);
  };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title={t("loadFailed")}
        retryLabel={t("tryAgain")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (offered.length === 0) {
    return (
      <p
        ref={emptyRef}
        tabIndex={-1}
        className="text-muted-foreground rounded-sm text-sm outline-none"
      >
        {t("articlesEmpty")}
      </p>
    );
  }
  return (
    <ul className="divide-border flex flex-col divide-y rounded-md border">
      {offered.map((article, index) => (
        <li key={article.id} className="flex items-center gap-3 px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {article.title}
            </span>
            {article.authorName && (
              <span className="text-muted-foreground truncate text-xs">
                {t("byAuthor", { name: article.authorName })}
              </span>
            )}
          </div>
          <Button
            ref={(el: HTMLButtonElement | null) => {
              if (el) addButtons.current.set(article.id, el);
              else addButtons.current.delete(article.id);
            }}
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("addArticle", { title: article.title })}
            onClick={() => add(index)}
          >
            {t("add")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
