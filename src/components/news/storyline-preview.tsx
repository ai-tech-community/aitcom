import { getTranslations } from "next-intl/server";
import { listStorylines } from "@/server/news/storylines";
import { Link } from "@/i18n/navigation";
import { StorylineList } from "./storyline-reader";

export async function StorylinePreview({ staff }: { staff: boolean }) {
  const t = await getTranslations("newsStories");
  let result;
  try {
    result = await listStorylines({ limit: 6 });
  } catch (err) {
    console.error("news: could not load ongoing stories", err);
  }
  return (
    <section className="mt-10 mb-10" aria-labelledby="ongoing-stories-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="ongoing-stories-heading" className="text-2xl font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">{t("intro")}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/news/stories" className="underline underline-offset-4">
            {t("allStories")}
          </Link>
          {staff && (
            <Link
              href="/news/stories/manage"
              className="underline underline-offset-4"
            >
              {t("manage")}
            </Link>
          )}
        </div>
      </div>
      {!result ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t("unavailable")}
        </p>
      ) : result.items.length ? (
        <StorylineList items={result.items} />
      ) : (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      )}
    </section>
  );
}
