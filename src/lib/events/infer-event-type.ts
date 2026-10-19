import type { EventType } from "@/lib/event-metadata";

const MEETUP_TITLE = /\bmeet-?ups?\b/i;
const SALON_TITLE = /\bsalon\b/i;
/** TechEx is the conference series. A hackathon inside that name stays a conference. */
const TECHEX_TITLE = /\btechex\b/i;
const HACKATHON_TITLE = /\bhackathons?\b|\bhack[\s-]?days?\b|\bhackfest\b/i;
const WORKSHOP_TITLE = /\bworkshops?\b/i;
const DEEP_DIVE_TITLE = /\bdeep[\s-]?dives?\b/i;
const CONFERENCE =
  /\b(?:conferences?|summits?|congress(?:es)?|expos?|symposiums?|gtc|neurips|iclr|icml|cvpr|tedai)\b/i;
const AI_ENGINEER_TITLE = /^AI Engineer\b/;

/**
 * The public type for an event, from its title and summary.
 *
 * The staff seed used to write `meetup` for every row. Conferences, summits,
 * and expos were labelled Meetup. A title that says meetup, salon, hackathon,
 * workshop, or deep dive keeps that type. TechEx is a conference even when
 * the title also says hackathon. Otherwise a conference, summit, congress,
 * expo, or symposium word in the title or summary wins. A fair or a startup
 * event that names none of these stays a meetup.
 */
export function inferEventType(input: {
  title: string;
  summary?: string | null;
}): EventType {
  const title = input.title.trim();
  const summary = (input.summary ?? "").trim();

  if (MEETUP_TITLE.test(title) || SALON_TITLE.test(title)) return "meetup";
  if (TECHEX_TITLE.test(title)) return "conference";
  if (HACKATHON_TITLE.test(title)) return "hackathon";
  if (WORKSHOP_TITLE.test(title)) return "workshop";
  if (DEEP_DIVE_TITLE.test(title)) return "deep_dive";
  if (CONFERENCE.test(title) || AI_ENGINEER_TITLE.test(title)) {
    return "conference";
  }
  if (CONFERENCE.test(summary)) return "conference";
  return "meetup";
}
