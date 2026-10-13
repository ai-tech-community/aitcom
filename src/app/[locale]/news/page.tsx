import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { SectionLabel } from "@/components/ui/section-label";
import { listNewsItems } from "@/server/news/list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: true },
  };
}

function formatWhen(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export default async function NewsPage() {
  const t = await getTranslations("newsPage");
  const locale = await getLocale();
  const items = await listNewsItems().catch((err: unknown) => {
    console.error("news: could not list stories", err);
    return [];
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <SectionLabel>{t("kicker")}</SectionLabel>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm">
        {t("description")}
      </p>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">{t("empty")}</p>
      ) : (
        <ul className="border-border mt-8 divide-y border-y">
          {items.map((item) => (
            <li key={item.id} id={`news-${item.id}`} className="py-4">
              <a
                href={item.url}
                rel="noopener noreferrer"
                className="text-foreground text-base font-semibold underline-offset-4 hover:underline"
              >
                {item.title}
              </a>
              {item.summary ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.summary}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-2 font-mono text-xs">
                {item.publishedAt
                  ? formatWhen(item.publishedAt, locale)
                  : t("undated")}
                {item.author ? ` · ${item.author}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
