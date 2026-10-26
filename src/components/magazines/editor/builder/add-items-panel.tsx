"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/trpc/react";

/**
 * "Add more": what an editor can put in the issue. This slice has two
 * tabs: the magazine's articles that are ready and in no issue yet, and an
 * editorial block of the editor's own text. Articles already in this issue
 * are not offered again.
 */
export function AddItemsPanel({
  communitySlug,
  articleIdsInIssue,
  onAddArticle,
  onAddEditorial,
}: {
  communitySlug: string;
  articleIdsInIssue: ReadonlySet<number>;
  onAddArticle: (article: { id: number; title: string }) => void;
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
            articleIdsInIssue={articleIdsInIssue}
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

function ReadyArticles({
  communitySlug,
  articleIdsInIssue,
  onAdd,
}: {
  communitySlug: string;
  articleIdsInIssue: ReadonlySet<number>;
  onAdd: (article: { id: number; title: string }) => void;
}) {
  const t = useTranslations("magazineEditor.builder.add");
  const query = api.magazines.availableArticles.useQuery({
    slug: communitySlug,
  });

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

  const offered = query.data.filter((a) => !articleIdsInIssue.has(a.id));
  if (offered.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("articlesEmpty")}</p>
    );
  }
  return (
    <ul className="divide-border flex flex-col divide-y rounded-md border">
      {offered.map((article) => (
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
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("addArticle", { title: article.title })}
            onClick={() => onAdd({ id: article.id, title: article.title })}
          >
            {t("add")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
