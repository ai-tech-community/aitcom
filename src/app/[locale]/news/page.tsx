import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { NewsRumorActions } from "@/components/news/news-rumor-actions";
import { NewsRumorForm } from "@/components/news/news-rumor-form";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/server/better-auth/server";
import {
  findNewsItem,
  listNewsItems,
  type NewsListItem,
} from "@/server/news/list";
import { listNewsRumors, type NewsRumorItem } from "@/server/news/rumors";
import { isNewsStaff } from "@/server/news/staff";

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

type NewsCard =
  | { kind: "story"; at: number; item: NewsListItem }
  | { kind: "rumor"; at: number; item: NewsRumorItem };

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ story?: string }>;
}) {
  const t = await getTranslations("newsPage");
  const locale = await getLocale();
  const params = await searchParams;
  const session = await getSession().catch(() => null);
  const staff = await isNewsStaff(session?.user?.email);
  const [listed, rumors] = await Promise.all([
    listNewsItems().catch((err: unknown) => {
      console.error("news: could not list stories", err);
      return [];
    }),
    listNewsRumors({ includeHidden: staff }).catch((err: unknown) => {
      console.error("news: could not list rumors", err);
      return [];
    }),
  ]);
  const storyId = params.story ?? "";
  const missing =
    storyId.length > 0 && !listed.some((item) => item.id === storyId);
  const extra = missing
    ? await findNewsItem(storyId).catch((err: unknown) => {
        console.error("news: could not load the linked story", err);
        return null;
      })
    : null;
  const stories = extra ? [extra, ...listed] : listed;

  const cards: NewsCard[] = [
    ...stories.map((item) => ({
      kind: "story" as const,
      at: item.publishedAt?.getTime() ?? 0,
      item,
    })),
    ...rumors.map((item) => ({
      kind: "rumor" as const,
      at: item.createdAt.getTime(),
      item,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel>{t("kicker")}</SectionLabel>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-base leading-relaxed">
        {t("description")}
      </p>

      {session?.user ? (
        <NewsRumorForm />
      ) : (
        <p className="text-muted-foreground mt-8 text-sm">
          <Link href="/auth/signin" className="hover:text-foreground underline">
            {t("signIn")}
          </Link>
        </p>
      )}

      {cards.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-5 lg:grid-cols-2">
          {cards.map((card) =>
            card.kind === "story" ? (
              <li
                key={`story-${card.item.id}`}
                id={`news-${card.item.id}`}
                className="border-border flex flex-col gap-2 border p-4"
              >
                <a
                  href={card.item.url}
                  rel="noopener noreferrer"
                  className="text-foreground text-base font-semibold underline-offset-4 hover:underline"
                >
                  {card.item.title}
                </a>
                {card.item.summary ? (
                  <p className="text-muted-foreground text-sm">
                    {card.item.summary}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-auto font-mono text-xs">
                  {card.item.publishedAt
                    ? formatWhen(card.item.publishedAt, locale)
                    : t("undated")}
                  {card.item.author ? ` · ${card.item.author}` : ""}
                </p>
              </li>
            ) : (
              <li
                key={`rumor-${card.item.id}`}
                id={`rumor-${card.item.id}`}
                className="border-border flex flex-col gap-2 border p-4"
              >
                {card.item.url ? (
                  <a
                    href={card.item.url}
                    rel="noopener noreferrer"
                    className="text-foreground text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {card.item.title}
                  </a>
                ) : (
                  <p className="text-foreground text-base font-semibold">
                    {card.item.title}
                  </p>
                )}
                <p className="text-muted-foreground text-sm">
                  {card.item.body}
                </p>
                <p className="text-muted-foreground mt-auto font-mono text-xs">
                  {t("rumorLabel")} · {t("unverified")}
                  {card.item.hiddenAt ? ` · ${t("hidden")}` : ""}
                  {" · "}
                  {formatWhen(card.item.createdAt, locale)}
                  {" · "}
                  {t("submittedBy", { name: card.item.submitterName })}
                </p>
                {staff ? (
                  <NewsRumorActions
                    id={card.item.id}
                    hidden={card.item.hiddenAt !== null}
                  />
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
    </main>
  );
}
