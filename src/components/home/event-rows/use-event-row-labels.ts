import { useTranslations } from "next-intl";
import type { EventRowLabels } from "./event-rows";

/**
 * The translated words every homepage event row needs (types, place,
 * "by <host>"), from the `events` messages. One source, so the timetable
 * and the recent gatherings can never word the same event differently.
 * Works in server and client components alike.
 */
export function useEventRowLabels(): EventRowLabels {
  const t = useTranslations("events");
  return {
    types: {
      workshop: t("eventTypeWorkshop"),
      hackathon: t("eventTypeHackathon"),
      deep_dive: t("eventTypeDeepDive"),
      meetup: t("eventTypeMeetup"),
    },
    online: t("online"),
    hybrid: t("formatHybrid"),
    inPerson: t("formatInPerson"),
    hostedBy: (name) => t("hostedBy", { name }),
  };
}
