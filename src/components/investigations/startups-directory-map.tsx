"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StartupsClusterMap } from "@/components/investigations/startups-cluster-map";
import { StartupLogo } from "@/components/investigations/startups-logo";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupProfilePath,
  presentText,
  startupMapPins,
  type StartupLocale,
  type StartupMapPin,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import {
  startupPinsInBounds,
  startupPinsPlace,
  type StartupMapBounds,
} from "@/lib/investigations/startups-map-clusters";

/** Rows rendered per "Show more" step; the map can hold thousands. */
const LIST_STEP = 40;

type Selection = { ids: ReadonlySet<string>; place: string | null };

/**
 * Split view: the list shows what the map shows. Panning or zooming
 * re-scopes the list to the viewport; picking a pin, or a bubble that
 * zooming cannot split, narrows it to exactly those companies.
 */
export function StartupsDirectoryMap({
  companies,
  locale,
}: {
  /** Already filtered and sorted by the directory. */
  companies: readonly StartupPublicCard[];
  locale: StartupLocale;
}) {
  const t = useTranslations("investigationsStartups");
  const numbers = useMemo(
    () => new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US"),
    [locale],
  );
  const pins = useMemo(() => startupMapPins([...companies]), [companies]);
  const [bounds, setBounds] = useState<StartupMapBounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [limit, setLimit] = useState(LIST_STEP);

  // A selection belongs to one result set; new filters drop it.
  const [selectionFor, setSelectionFor] = useState(companies);
  if (selectionFor !== companies) {
    setSelectionFor(companies);
    setSelection(null);
    setLimit(LIST_STEP);
  }

  const listed = useMemo(() => {
    const ids = selection
      ? selection.ids
      : new Set(
          (bounds ? startupPinsInBounds(pins, bounds) : pins).map(
            (pin) => pin.id,
          ),
        );
    // Keep the directory's sort order rather than map order.
    return companies.filter((card) => ids.has(card.id));
  }, [companies, pins, bounds, selection]);

  if (pins.length === 0) {
    return <EmptyState title={t("mapEmpty")} />;
  }

  const unpinned = companies.length - pins.length;
  const shown = listed.slice(0, limit);

  function select(picked: StartupMapPin[]) {
    setSelection({
      ids: new Set(picked.map((pin) => pin.id)),
      place: startupPinsPlace(picked),
    });
    setLimit(LIST_STEP);
  }

  return (
    <div
      data-startups-map-view=""
      className="border-border grid grid-cols-1 overflow-hidden rounded-xl border lg:h-[min(80dvh,56rem)] lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <div
        role="region"
        aria-label={t("mapLabel")}
        className="relative z-0 h-[55dvh] lg:order-last lg:h-full"
      >
        <StartupsClusterMap
          pins={pins}
          activeId={activeId}
          formatCount={(count) => numbers.format(count)}
          clusterTitle={(count) => t("resultsCount", { count })}
          onViewChange={(next) => {
            // Moving the map hands the list back to the viewport.
            setBounds(next);
            setSelection(null);
            setLimit(LIST_STEP);
          }}
          onSelect={select}
        />
      </div>

      <section
        aria-label={t("mapListLabel")}
        className="border-border flex min-h-0 flex-col border-t lg:border-t-0 lg:border-r"
      >
        <header className="border-border flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2">
          <p
            aria-live="polite"
            data-startups-map-count=""
            className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase tabular-nums"
          >
            {selection
              ? selection.place
                ? t("mapSelectionAt", {
                    count: listed.length,
                    place: selection.place,
                  })
                : t("resultsCount", { count: listed.length })
              : t("mapInView", { count: listed.length })}
          </p>
          {selection ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setSelection(null)}
            >
              <X aria-hidden="true" />
              {t("mapShowAll")}
            </Button>
          ) : null}
        </header>

        {listed.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm text-balance">
            {t("mapEmptyView")}
          </p>
        ) : (
          <ul className="divide-border min-h-0 flex-1 divide-y lg:overflow-y-auto">
            {shown.map((card) => (
              <MapListRow
                key={card.id}
                card={card}
                locale={locale}
                active={card.id === activeId}
                openRoles={t("rolesCta", { count: card.openRoleCount })}
                onActive={setActiveId}
              />
            ))}
            {listed.length > shown.length ? (
              <li className="p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setLimit((current) => current + LIST_STEP)}
                >
                  {t("mapShowMore")}
                </Button>
              </li>
            ) : null}
          </ul>
        )}

        {unpinned > 0 ? (
          <p className="border-border text-muted-foreground border-t px-4 py-3 text-xs">
            {t("mapUnpinned", { count: unpinned })}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function MapListRow({
  card,
  locale,
  active,
  openRoles,
  onActive,
}: {
  card: StartupPublicCard;
  locale: StartupLocale;
  active: boolean;
  openRoles: string;
  onActive: (id: string | null) => void;
}) {
  const region = presentText(card.region);
  const meta = [STARTUP_CATEGORY_LABELS[card.category][locale], region]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-startups-map-row={card.id}
      data-active={active ? "" : undefined}
      onMouseEnter={() => onActive(card.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(card.id)}
      onBlur={() => onActive(null)}
      className="data-[active]:bg-muted/60 has-[a:focus-visible]:ring-ring/50 relative flex items-center gap-3 px-4 py-3 transition-colors has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-inset"
    >
      <StartupLogo card={card} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Stretched link: the whole row opens the profile. */}
        <Link
          href={buildStartupProfilePath(card.slug)}
          className="truncate font-medium outline-none after:absolute after:inset-0"
        >
          {card.name}
        </Link>
        <span className="text-muted-foreground truncate text-sm">{meta}</span>
      </div>
      {card.openRoleCount > 0 ? (
        <Badge variant="outline" className="shrink-0">
          {openRoles}
        </Badge>
      ) : null}
    </li>
  );
}
