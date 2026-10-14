"use client";

import { StorylineSuggestions } from "./storyline-suggestions";
import type { StorylineSuggestion } from "@/lib/news/storyline-suggestions";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StorylineLoading } from "./storyline-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  publicationIssues,
  storylineInputSchema,
  storylineRelations,
  type StorylineInput,
  type StorylineArticle,
} from "@/lib/news/storylines";
import type { StorylineDetail } from "@/server/news/storylines";

const selectClass =
  "border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

function ConnectionFields({
  connection,
  articles,
  onChange,
  onRemove,
}: {
  connection: StorylineInput["connections"][number];
  articles: StorylineArticle[];
  onChange: (patch: Partial<StorylineInput["connections"][number]>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("newsStories");
  const target = api.news.readStoryline.useQuery(
    { id: connection.targetId },
    { refetchOnWindowFocus: false },
  );
  return (
    <fieldset className="border-border space-y-4 border-t pt-5">
      <legend className="max-w-full truncate font-semibold">
        {target.data?.titleEn ?? t("loading")}
      </legend>
      {target.error && (
        <ErrorState
          title={t("loadFailed")}
          onRetry={() => void target.refetch()}
          retryLabel={t("retry")}
        />
      )}
      {target.isSuccess && !target.data && (
        <ErrorState
          title={t("errors.missing")}
          description={t("new")}
          onRetry={() => void target.refetch()}
          retryLabel={t("retry")}
        />
      )}
      <label className="block text-sm">
        {t("relation")}
        <select
          className={`${selectClass} mt-2`}
          value={connection.relation}
          onChange={(e) =>
            onChange({ relation: e.target.value as typeof connection.relation })
          }
        >
          {storylineRelations.map((relation) => (
            <option key={relation} value={relation}>
              {t(`relations.${relation}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          {t("fromArticle")}
          <select
            className={`${selectClass} mt-2`}
            value={connection.fromArticleId}
            onChange={(e) => onChange({ fromArticleId: e.target.value })}
          >
            <option value="">{t("chooseArticle")}</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("toArticle")}
          <select
            className={`${selectClass} mt-2`}
            value={connection.toArticleId}
            onChange={(e) => onChange({ toArticleId: e.target.value })}
          >
            <option value="">{t("chooseArticle")}</option>
            {target.data?.articles.map((m) => (
              <option key={m.articleId} value={m.articleId}>
                {m.article.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        {t("explanationEn")}
        <Textarea
          className="mt-2"
          value={connection.explanationEn}
          maxLength={1200}
          onChange={(e) => onChange({ explanationEn: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t("explanationNl")}
        <Textarea
          className="mt-2"
          value={connection.explanationNl}
          maxLength={1200}
          onChange={(e) => onChange({ explanationNl: e.target.value })}
        />
      </label>
      <Button variant="outline" type="button" onClick={onRemove}>
        {t("remove")}
      </Button>
    </fieldset>
  );
}

function StorylineForm({
  initial,
  onCreated,
  onDirty,
  onReload,
  onPending,
  locked,
  suggestion,
}: {
  initial: StorylineDetail | null;
  onCreated: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  onReload: () => void;
  onPending: (pending: boolean) => void;
  locked: boolean;
  suggestion: StorylineSuggestion | null;
}) {
  const t = useTranslations("newsStories");
  const utils = api.useUtils();
  const [draft, setDraft] = useState<StorylineInput>(() =>
    suggestion
      ? suggestion.input
      : initial
        ? {
            id: initial.id,
            slug: initial.slug,
            titleEn: initial.titleEn,
            titleNl: initial.titleNl,
            overviewEn: initial.overviewEn,
            overviewNl: initial.overviewNl,
            questionsEn: initial.questionsEn,
            questionsNl: initial.questionsNl,
            status: initial.status,
            revision: initial.revision,
            articles: initial.articles.map(
              ({ articleId, noteEn, noteNl, evidence }) => ({
                articleId,
                noteEn,
                noteNl,
                evidence,
              }),
            ),
            connections: initial.connections.map(
              ({
                targetId,
                relation,
                explanationEn,
                explanationNl,
                fromArticleId,
                toArticleId,
              }) => ({
                targetId,
                relation,
                explanationEn,
                explanationNl,
                fromArticleId,
                toArticleId,
              }),
            ),
          }
        : {
            slug: "",
            titleEn: "",
            titleNl: "",
            overviewEn: "",
            overviewNl: "",
            questionsEn: [],
            questionsNl: [],
            status: "draft",
            revision: 0,
            articles: [],
            connections: [],
          },
  );
  const [articles, setArticles] = useState<StorylineArticle[]>(
    () => suggestion?.articles ?? initial?.articles.map((m) => m.article) ?? [],
  );
  const [notice, setNotice] = useState("");
  const [articleQuery, setArticleQuery] = useState("");
  const [articlePage, setArticlePage] = useState(1);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetPage, setTargetPage] = useState(1);
  const search = api.news.searchStorylineArticles.useQuery(
    { q: articleQuery, page: articlePage },
    { refetchOnWindowFocus: false },
  );
  const targets = api.news.listStorylines.useQuery(
    { q: targetQuery, page: targetPage },
    { refetchOnWindowFocus: false },
  );
  const save = api.news.saveStoryline.useMutation({
    onSuccess: (result, input) => {
      onPending(false);
      setDraft((current) => ({
        ...current,
        id: result.id,
        sourceDraftId: undefined,
        revision: (input.revision ?? 0) + 1,
        status: input.status,
      }));
      setNotice(t("saved"));
      onDirty(false);
      void utils.news.listStorylines.invalidate();
      void utils.news.readStoryline.invalidate({ id: result.id });
      void utils.news.listAgentStorylineDrafts.invalidate();
      if (!input.id) onCreated(result.id);
    },
    onError: (err) => {
      onPending(false);
      const known = [
        "stale",
        "immutableSlug",
        "slugTaken",
        "missing",
        "connectionEvidence",
        "sourceDraftReviewed",
        "sourceDraft",
      ] as const;
      const code = known.find((key) => key === err.message);
      setNotice(
        code
          ? t(`errors.${code}`)
          : err.message.startsWith("publish:")
            ? err.message
                .slice(8)
                .split(",")
                .map((issue) => {
                  const valid = publicationIssues(draft, articles).find(
                    (key) => key === issue,
                  );
                  return valid ? t(`errors.${valid}`) : t("failed");
                })
                .join(" ")
            : t("failed"),
      );
    },
  });
  const patch = (value: Partial<StorylineInput>) => {
    onDirty(true);
    setNotice("");
    setDraft((current) => ({ ...current, ...value }));
  };
  const issues = publicationIssues(draft, articles);
  const submit = (status: StorylineInput["status"]) => {
    const checked = storylineInputSchema.safeParse({ ...draft, status });
    if (!checked.success) {
      setNotice(t("failed"));
      return;
    }
    if (status === "published" && issues.length) {
      setNotice(t("blocked"));
      return;
    }
    setNotice("");
    onPending(true);
    save.mutate(checked.data);
  };
  const pages = (
    page: number,
    totalPages: number,
    setPage: (p: number) => void,
  ) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        variant="outline"
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        {t("previous")}
      </Button>
      <span className="text-muted-foreground text-sm">
        {t("page", { page, total: totalPages })}
      </span>
      <Button
        variant="outline"
        type="button"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        {t("next")}
      </Button>
    </div>
  );

  return (
    <form
      className="mt-8 space-y-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit(draft.status);
      }}
    >
      <fieldset
        disabled={save.isPending || locked}
        className="space-y-10 disabled:opacity-70"
      >
        <section className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            {t("slug")}
            <Input
              className="mt-2"
              value={draft.slug}
              onChange={(e) => patch({ slug: e.target.value })}
              maxLength={100}
              disabled={!!draft.id}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <span className="text-muted-foreground mt-2 block text-xs">
              {t("slugHelp")}
            </span>
          </label>
          {(["titleEn", "titleNl"] as const).map((key) => (
            <label key={key} className="text-sm">
              {t(key)}
              <Input
                className="mt-2"
                value={draft[key]}
                onChange={(e) => patch({ [key]: e.target.value })}
                maxLength={200}
                required={key === "titleEn"}
              />
            </label>
          ))}
          {(["overviewEn", "overviewNl"] as const).map((key) => (
            <label key={key} className="text-sm">
              {t(key)}
              <Textarea
                className="mt-2 min-h-28"
                value={draft[key]}
                onChange={(e) => patch({ [key]: e.target.value })}
                maxLength={2000}
              />
            </label>
          ))}
          {(["questionsEn", "questionsNl"] as const).map((key) => (
            <label key={key} className="text-sm">
              {t(key)}
              <Textarea
                className="mt-2"
                defaultValue={draft[key].join("\n")}
                onChange={(e) =>
                  patch({
                    [key]: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          ))}
        </section>
        <section className="border-border border-t pt-8">
          <h2 className="text-2xl font-semibold">{t("articles")}</h2>
          {!draft.articles.length && (
            <EmptyState
              title={t("nothingSelected")}
              description={t("articleSearch")}
            />
          )}
          <div className="mt-5 space-y-8">
            {draft.articles.map((m, index) => {
              const article = articles.find((a) => a.id === m.articleId);
              return (
                <fieldset
                  key={m.articleId}
                  className="border-border space-y-4 border-b pb-6"
                >
                  <legend className="text-lg font-semibold">
                    {article?.title}
                  </legend>
                  <details className="text-sm">
                    <summary className="focus-visible:ring-ring cursor-pointer rounded-sm focus-visible:ring-2">
                      {t("excerpt")}
                    </summary>
                    <p className="text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                      {article?.summary}
                    </p>
                    <a
                      href={article?.url}
                      rel="noopener noreferrer"
                      className="mt-2 inline-block underline"
                    >
                      {t("source")}
                    </a>
                  </details>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["noteEn", "noteNl"] as const).map((key) => (
                      <label key={key} className="text-sm">
                        {t(key)}
                        <Textarea
                          className="mt-2"
                          value={m[key]}
                          maxLength={2000}
                          onChange={(e) =>
                            patch({
                              articles: draft.articles.map((row, i) =>
                                i === index
                                  ? { ...row, [key]: e.target.value }
                                  : row,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block text-sm">
                    {t("evidence")}
                    <Textarea
                      className="mt-2"
                      value={m.evidence}
                      maxLength={240}
                      onChange={(e) =>
                        patch({
                          articles: draft.articles.map((row, i) =>
                            i === index
                              ? { ...row, evidence: e.target.value }
                              : row,
                          ),
                        })
                      }
                    />
                    <span className="text-muted-foreground mt-2 block text-xs">
                      {t("evidenceHelp")}
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      patch({
                        articles: draft.articles.filter((_, i) => i !== index),
                        connections: draft.connections.filter(
                          (c) => c.fromArticleId !== m.articleId,
                        ),
                      });
                      setArticles((current) =>
                        current.filter((a) => a.id !== m.articleId),
                      );
                    }}
                  >
                    {t("remove")}
                  </Button>
                </fieldset>
              );
            })}
          </div>
          <label className="mt-6 block text-sm">
            {t("articleSearch")}
            <Input
              className="mt-2"
              value={articleQuery}
              maxLength={200}
              onChange={(e) => {
                setArticleQuery(e.target.value);
                setArticlePage(1);
              }}
            />
          </label>
          {search.isLoading && <StorylineLoading />}
          {search.error && (
            <ErrorState
              title={t("loadFailed")}
              onRetry={() => void search.refetch()}
              retryLabel={t("retry")}
            />
          )}
          {search.data && (
            <>
              <ul className="mt-4 divide-y">
                {search.data.items.map((article) => {
                  const attached = draft.articles.some(
                    (m) => m.articleId === article.id,
                  );
                  return (
                    <li
                      key={article.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        {article.title}
                      </span>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={attached || draft.articles.length >= 60}
                        onClick={() => {
                          patch({
                            articles: [
                              ...draft.articles,
                              {
                                articleId: article.id,
                                noteEn: "",
                                noteNl: "",
                                evidence: "",
                              },
                            ],
                          });
                          setArticles((current) => [...current, article]);
                        }}
                      >
                        {t(attached ? "attached" : "attach")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {!search.data.items.length && (
                <EmptyState
                  title={t("noResults")}
                  description={t("searchHint")}
                />
              )}
              {pages(search.data.page, search.data.totalPages, setArticlePage)}
            </>
          )}
        </section>
        <section className="border-border border-t pt-8">
          <h2 className="text-2xl font-semibold">{t("connections")}</h2>
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">
            {t("connectionHelp")}
          </p>
          <div className="mt-6 space-y-6">
            {draft.connections.map((c, index) => (
              <ConnectionFields
                key={`${c.targetId}:${index}`}
                connection={c}
                articles={articles}
                onChange={(value) =>
                  patch({
                    connections: draft.connections.map((row, i) =>
                      i === index ? { ...row, ...value } : row,
                    ),
                  })
                }
                onRemove={() =>
                  patch({
                    connections: draft.connections.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              />
            ))}
          </div>
          <label className="mt-6 block text-sm">
            {t("target")}
            <Input
              className="mt-2"
              value={targetQuery}
              maxLength={200}
              onChange={(e) => {
                setTargetQuery(e.target.value);
                setTargetPage(1);
              }}
            />
          </label>
          {targets.isLoading && <StorylineLoading />}
          {targets.error && (
            <ErrorState
              title={t("loadFailed")}
              onRetry={() => void targets.refetch()}
              retryLabel={t("retry")}
            />
          )}
          {targets.data && (
            <>
              <ul className="mt-4 divide-y">
                {targets.data.items
                  .filter((target) => target.id !== draft.id)
                  .map((target) => (
                    <li
                      key={target.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        {target.titleEn} · {t(target.status)}
                      </span>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={draft.connections.length >= 20}
                        onClick={() =>
                          patch({
                            connections: [
                              ...draft.connections,
                              {
                                targetId: target.id,
                                relation: "shared_development",
                                explanationEn: "",
                                explanationNl: "",
                                fromArticleId: "",
                                toArticleId: "",
                              },
                            ],
                          })
                        }
                      >
                        {t("connect")}
                      </Button>
                    </li>
                  ))}
              </ul>
              {!targets.data.items.length && (
                <EmptyState
                  title={t("noResults")}
                  description={t("searchHint")}
                />
              )}
              {pages(targets.data.page, targets.data.totalPages, setTargetPage)}
            </>
          )}
        </section>
        <section className="border-border border-t pt-6">
          {!!issues.length && (
            <div className="mb-5">
              <h2 className="font-semibold">{t("blocked")}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue}>{t(`errors.${issue}`)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => submit("draft")}
            >
              {t("save")}
            </Button>
            <Button
              type="button"
              disabled={issues.length > 0}
              onClick={() => submit("published")}
            >
              {t(
                save.isPending
                  ? "saving"
                  : draft.status === "published"
                    ? "savePublished"
                    : "publish",
              )}
            </Button>
            {draft.id && draft.status === "published" && (
              <Link
                href={`/news/stories/${draft.slug}`}
                className="self-center text-sm underline underline-offset-4"
              >
                {t("preview")}
              </Link>
            )}
          </div>
        </section>
      </fieldset>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {notice === t("errors.stale") && (
        <Button type="button" variant="outline" onClick={onReload}>
          {t("reload")}
        </Button>
      )}
    </form>
  );
}

export function StorylineEditor() {
  const t = useTranslations("newsStories");
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [suggestion, setSuggestion] = useState<StorylineSuggestion | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const choose = async (id: string) => {
    if (saving || switching) return;
    setSwitching(true);
    try {
      if (dirty && !(await confirm({ description: t("discardChanges") })))
        return;
      setDirty(false);
      setSuggestion(null);
      setSelectedId(id);
      setVersion((v) => v + 1);
    } finally {
      setSwitching(false);
    }
  };
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = api.news.listStorylines.useQuery(
    { q, page },
    { refetchOnWindowFocus: false },
  );
  const detail = api.news.readStoryline.useQuery(
    { id: selectedId },
    { enabled: !!selectedId, refetchOnWindowFocus: false, staleTime: Infinity },
  );
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr]">
      <aside>
        <Button
          type="button"
          variant="outline"
          disabled={saving || switching}
          onClick={() => void choose("")}
        >
          {t("new")}
        </Button>
        <label className="mt-5 block text-sm">
          {t("drafts")}
          <Input
            className="mt-2"
            value={q}
            maxLength={200}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {list.isLoading && <StorylineLoading />}
        {list.error && (
          <ErrorState
            title={t("loadFailed")}
            onRetry={() => void list.refetch()}
            retryLabel={t("retry")}
          />
        )}
        {list.data && !list.data.items.length && (
          <EmptyState title={t("noResults")} description={t("new")} />
        )}
        <ul className="mt-4 divide-y">
          {list.data?.items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={selectedId === s.id ? "true" : undefined}
                className="focus-visible:ring-ring w-full rounded-sm py-3 text-left text-sm underline-offset-4 hover:underline focus-visible:ring-2"
                disabled={saving || switching}
                onClick={() => void choose(s.id)}
              >
                {s.titleEn}
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t(s.status)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {list.data && list.data.totalPages > 1 && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              disabled={list.data.page <= 1}
              onClick={() => setPage(list.data.page - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              disabled={list.data.page >= list.data.totalPages}
              onClick={() => setPage(list.data.page + 1)}
            >
              {t("next")}
            </Button>
          </div>
        )}
      </aside>
      <div>
        <StorylineSuggestions
          locked={saving || switching}
          onReview={(proposal) => {
            void (async () => {
              if (saving || switching) return;
              setSwitching(true);
              try {
                if (
                  dirty &&
                  !(await confirm({ description: t("discardChanges") }))
                )
                  return;
                setSelectedId("");
                setSuggestion(proposal);
                setDirty(true);
                setVersion((v) => v + 1);
              } finally {
                setSwitching(false);
              }
            })();
          }}
        />
        {selectedId && detail.isLoading ? (
          <StorylineLoading />
        ) : selectedId && detail.error ? (
          <ErrorState
            title={t("loadFailed")}
            onRetry={() => void detail.refetch()}
            retryLabel={t("retry")}
          />
        ) : selectedId && !detail.data ? (
          <ErrorState
            title={t("errors.missing")}
            description={t("new")}
            onRetry={() => void detail.refetch()}
            retryLabel={t("retry")}
          />
        ) : (
          <StorylineForm
            key={`${selectedId}:${version}`}
            initial={selectedId ? detail.data! : null}
            onCreated={(id) => {
              setSuggestion(null);
              setSelectedId(id);
            }}
            suggestion={suggestion}
            onDirty={setDirty}
            onPending={setSaving}
            locked={saving || switching}
            onReload={async () => {
              if (saving || switching) return;
              setSwitching(true);
              try {
                if (
                  dirty &&
                  !(await confirm({ description: t("discardChanges") }))
                )
                  return;
                const result = await detail.refetch();
                if (result.error) return;
                setDirty(false);
                setVersion((v) => v + 1);
              } finally {
                setSwitching(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
