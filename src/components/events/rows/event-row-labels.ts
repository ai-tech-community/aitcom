import type { EventRowLabels } from "./event-rows";

/** The `events` message keys the row labels read. */
type EventRowLabelKey =
  | "eventTypeWorkshop"
  | "eventTypeHackathon"
  | "eventTypeDeepDive"
  | "eventTypeMeetup"
  | "online"
  | "formatHybrid"
  | "formatInPerson"
  | "placeToBeAnnounced"
  | "hostedBy";

/** A translator for the `events` messages, from the hook or the server. */
export type EventRowTranslator = (
  key: EventRowLabelKey,
  values?: { name: string },
) => string;

/**
 * The translated words every event row needs (types, place, "by <host>"),
 * built from the `events` messages. One source, so no two surfaces word
 * the same event differently; `useEventRowLabels` and `getEventRowLabels`
 * only choose where the translator comes from.
 */
export function eventRowLabelsFrom(t: EventRowTranslator): EventRowLabels {
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
    placeToBeAnnounced: t("placeToBeAnnounced"),
  };
}
