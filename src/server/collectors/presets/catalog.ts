// src/server/collectors/presets/catalog.ts
import { feedItems } from "../collectors/feed-items";
import { pageList } from "../collectors/page-list";
import { type AnyPreset, CUSTOM_PAGE_PRESET_ID, definePreset } from "./preset";

const feed = definePreset(feedItems, {
  id: "feed",
  group: "research",
  title: { en: "News or blog feed", nl: "Nieuws- of blogfeed" },
  summary: {
    en: "The latest items of an RSS or Atom feed: title, link, date, author and a short summary.",
    nl: "De nieuwste items van een RSS- of Atom-feed: titel, link, datum, auteur en een korte samenvatting.",
  },
  base: {},
  ask: ["url"],
});

const customPage = definePreset(pageList, {
  id: CUSTOM_PAGE_PRESET_ID,
  group: "custom",
  title: { en: "Custom page", nl: "Eigen pagina" },
  summary: {
    en: "Any list on a web page, read with the CSS selectors you give. For sites we don't know yet.",
    nl: "Elke lijst op een webpagina, gelezen met de CSS-selectors die jij opgeeft. Voor sites die we nog niet kennen.",
  },
  base: {},
  ask: ["url", "itemSelector", "fields", "nextPageSelector", "maxPages"],
});

/**
 * Every preset, as typed data in code (Prototype; same approach as the
 * collector catalog, ADR-0040). Order is rail order within a group and
 * recognition order. Adding a preset = one entry here.
 */
const PRESETS: readonly AnyPreset[] = [feed, customPage];

export function allPresets(): readonly AnyPreset[] {
  return PRESETS;
}

export function getPreset(id: string): AnyPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
