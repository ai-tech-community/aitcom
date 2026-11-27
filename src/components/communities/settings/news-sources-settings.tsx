"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

export function NewsSourcesSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.newsSources");
  const [search, setSearch] = useState("");
  const [url, setUrl] = useState("");
  const utils = api.useUtils();
  const catalog = api.news.sources.list.useQuery({ slug });
  const preview = api.news.sources.preview.useMutation();
  const refresh = async () => {
    await Promise.all([
      utils.news.sources.list.invalidate({ slug }),
      utils.news.communityStories.invalidate({ slug }),
    ]);
  };
  const add = api.news.sources.add.useMutation({
    onSuccess: async () => {
      setUrl("");
      preview.reset();
      await refresh();
    },
  });
  const select = api.news.sources.select.useMutation({ onSuccess: refresh });
  const remove = api.news.sources.remove.useMutation({ onSuccess: refresh });
  const busy =
    add.isPending || select.isPending || remove.isPending || preview.isPending;
  const selected = catalog.data?.filter((row) => row.selected) ?? [];
  const term = search.trim().toLowerCase();
  const available =
    catalog.data?.filter(
      (row) =>
        !row.selected &&
        (row.name + " " + row.url).toLowerCase().includes(term),
    ) ?? [];

  function sourceRow(row: NonNullable<typeof catalog.data>[number]) {
    return (
      <li
        key={row.id}
        className="flex items-center justify-between gap-3 border-b py-2"
      >
        <div className="min-w-0">
          <div>{row.name}</div>
          <div className="text-muted-foreground text-xs break-all">
            {row.url}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={t(row.selected ? "remove" : "add") + " " + row.name}
          onClick={() => {
            select.reset();
            remove.reset();
            add.reset();
            (row.selected ? remove : select).mutate({ slug, feedId: row.id });
          }}
        >
          {t(row.selected ? "remove" : "add")}
        </Button>
      </li>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {catalog.isPending ? (
        <p>{t("loading")}</p>
      ) : catalog.isError ? (
        <p role="alert">{t("loadError")}</p>
      ) : (
        <>
          <section>
            <h2 className="font-medium">{t("selected")}</h2>
            {selected.length ? (
              <ul>{selected.map(sourceRow)}</ul>
            ) : (
              <p className="text-muted-foreground text-sm">{t("fallback")}</p>
            )}
          </section>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.reset();
              preview.mutate({ slug, url });
            }}
          >
            <label htmlFor="news-source-url">{t("website")}</label>
            <Input
              id="news-source-url"
              type="url"
              placeholder="https://"
              required
              disabled={busy}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                preview.reset();
                add.reset();
              }}
            />
            <Button variant="outline" disabled={busy || !url.trim()}>
              {t("preview")}
            </Button>
          </form>
          {preview.isError && <p role="alert">{t("unreadable")}</p>}
          {preview.data?.kind === "website" && (
            <section>
              <h2>{t("choose")}</h2>
              <ul>
                {preview.data.choices.map((choice) => (
                  <li key={choice.url}>
                    <Button
                      variant="link"
                      disabled={busy}
                      onClick={() => preview.mutate({ slug, url: choice.url })}
                    >
                      {choice.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.data?.kind === "feed" && (
            <div className="space-y-2 rounded border p-3">
              <strong>{preview.data.name}</strong>
              <p className="text-xs break-all">{preview.data.url}</p>
              <p>{preview.data.headline}</p>
              <Button
                disabled={busy}
                onClick={() => {
                  if (preview.data?.kind === "feed")
                    add.mutate({ slug, url: preview.data.url });
                }}
              >
                {t("confirm")}
              </Button>
            </div>
          )}
          {(add.isError || select.isError || remove.isError) && (
            <p role="alert">{t("error")}</p>
          )}
          <section className="space-y-2">
            <label htmlFor="news-source-search">{t("search")}</label>
            <Input
              type="search"
              id="news-source-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {available.length ? (
              <ul className="max-h-96 overflow-y-auto">
                {available.map(sourceRow)}
              </ul>
            ) : (
              <p>{t("noResults")}</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
