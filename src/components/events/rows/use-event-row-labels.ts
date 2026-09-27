import { useTranslations } from "next-intl";
import type { EventRowLabels } from "./event-rows";
import { eventRowLabelsFrom } from "./event-row-labels";

/**
 * The shared event row labels (see `eventRowLabelsFrom`) for client
 * components and non-async server components. Async server components use
 * `getEventRowLabels`.
 */
export function useEventRowLabels(): EventRowLabels {
  return eventRowLabelsFrom(useTranslations("events"));
}
