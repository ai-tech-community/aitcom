import { NewsSectionTabs } from "./news-section-tabs";

/** Shared frame for the news table and the ongoing-stories list. */
export function NewsSection({
  label,
  news,
  stories,
  children,
  actions,
}: {
  label: string;
  news: string;
  stories: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-6 sm:px-12 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-fit flex-1">
          <NewsSectionTabs label={label} news={news} stories={stories} />
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4 sm:mt-6">{children}</div>
    </main>
  );
}
