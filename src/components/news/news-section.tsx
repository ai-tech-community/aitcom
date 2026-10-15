import { NewsSectionTabs } from "./news-section-tabs";

/** Shared frame for the news table and the ongoing-stories list. */
export function NewsSection({
  label,
  news,
  stories,
  children,
}: {
  label: string;
  news: string;
  stories: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <NewsSectionTabs label={label} news={news} stories={stories} />
      <div className="mt-8">{children}</div>
    </main>
  );
}
