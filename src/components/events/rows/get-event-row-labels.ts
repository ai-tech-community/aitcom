import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventRowLabels } from "./event-rows";
import { eventRowLabelsFrom } from "./event-row-labels";

/** The shared event row labels for async server components and routes. */
export async function getEventRowLabels(): Promise<EventRowLabels> {
  return eventRowLabelsFrom(await getTranslations("events"));
}
