import { JsonLd } from "@/components/json-ld";
import { StartupLogo } from "@/components/investigations/startups-logo";
import { SectionLabel } from "@/components/ui/section-label";
import {
  aiToolsHubPageHref,
  aiToolsHubProfileHref,
  aiToolsHubProfileUrl,
  aiToolsListCopy,
  aiToolsListJsonLd,
  aiToolsOnPage,
} from "@/lib/investigations/ai-tools-list";
import {
  STARTUP_CATEGORY_LABELS,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

const PAGE_LINK =
  "font-mono text-xs tracking-wider rounded border px-3 py-1.5 transition-colors";
const PAGE_IDLE = "border-border text-muted-foreground hover:bg-secondary/40";

/**
 * Agents and models that pass the thin-profile rule. Logos use the
 * recorded mark or the letters monogram. Nothing else is drawn.
 */
export function AiToolsListHub({
  locale,
  cards,
  page,
  totalPages,
}: {
  locale: string;
  cards: readonly Pick<
    StartupPublicCard,
    "name" | "slug" | "logoUrl" | "category"
  >[];
  page: number;
  totalPages: number;
}) {
  const copy = aiToolsListCopy(locale);
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const pager =
    copyLocale === "nl"
      ? { prev: "Vorige", next: "Volgende", label: "Pagina's" }
      : { prev: "Previous", next: "Next", label: "Pages" };
  const entries = cards.flatMap((card) => {
    const url = aiToolsHubProfileUrl(locale, card.slug);
    const [listed] = aiToolsOnPage([{ name: card.name, url }]);
    if (!listed) return [];
    return [{ card, url: listed.url }];
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd
        data={aiToolsListJsonLd(
          locale,
          entries.map((entry) => ({ name: entry.card.name, url: entry.url })),
          page,
        )}
      />
      <SectionLabel as="div">{copy.kicker}</SectionLabel>
      <h1 className="mt-8 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {copy.heading}
      </h1>
      <p className="text-muted-foreground mt-6 max-w-[65ch] text-lg leading-relaxed text-pretty">
        {copy.intro}
      </p>
      {entries.length > 0 ? (
        <ul className="border-border mt-10 max-w-2xl divide-y border-y">
          {entries.map((entry) => (
            <li key={entry.card.slug} className="flex items-center gap-3 py-3">
              <StartupLogo card={entry.card} size="sm" />
              <div className="min-w-0">
                <a
                  href={aiToolsHubProfileHref(locale, entry.card.slug)}
                  className="hover:text-foreground font-medium underline-offset-4 hover:underline"
                >
                  {entry.card.name}
                </a>
                <p className="text-muted-foreground text-sm">
                  {STARTUP_CATEGORY_LABELS[entry.card.category][copyLocale]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {totalPages > 1 ? (
        <nav
          aria-label={pager.label}
          className="mt-8 flex flex-wrap items-center gap-1.5"
        >
          {page > 1 ? (
            <a
              href={aiToolsHubPageHref(locale, page - 1)}
              className={`${PAGE_LINK} ${PAGE_IDLE}`}
            >
              ← {pager.prev}
            </a>
          ) : null}
          <span className="text-muted-foreground font-mono text-xs tracking-wider">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <a
              href={aiToolsHubPageHref(locale, page + 1)}
              className={`${PAGE_LINK} ${PAGE_IDLE}`}
            >
              {pager.next} →
            </a>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
