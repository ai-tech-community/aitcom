import { formatInstantInZone, isValidTimeZone } from "@/lib/event-time";
import type {
  AttendeeDetails,
  AttendeeStatus,
} from "@/server/events/attendee-details";

/** Column headers and status words, in the organizer's language. */
export interface AttendeeCsvLabels {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  /** Takes the timezone the times are written in, e.g. "Europe/Amsterdam". */
  registeredAt: (timezone: string) => string;
  waitlistPlace: string;
  paymentStatus: string;
  memberSince: string;
  earlierEvents: string;
  company: string;
  linkedin: string;
  github: string;
  website: string;
  experience: string;
  skills: string;
  interests: string;
  statuses: Record<AttendeeStatus, string>;
}

/**
 * A spreadsheet cell. Quoted per RFC 4180 when it holds a comma, quote,
 * line break or edge space. A value a spreadsheet would run as a formula
 * (starting with = + - @, tab or CR) gets a leading apostrophe, so member-
 * typed text like a company named "=HYPERLINK(...)" stays text (CSV
 * injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The organizer's attendee rows as a CSV file. Rows come from the attendee
 * read model, so private profiles and registrations made before the sharing
 * notice already have their email and profile fields empty here too. Times
 * are the event's own wall-clock time, named in the header. Starts with a
 * byte order mark so spreadsheet apps read accented names as UTF-8.
 */
export function toAttendeesCsv(
  rows: readonly AttendeeDetails[],
  options: {
    timezone: string | null;
    labels: AttendeeCsvLabels;
    /** The event's questions: one column each, after the fixed columns. */
    questions?: readonly { id: string; label: string }[];
  },
): string {
  const questions = options.questions ?? [];
  const zone = isValidTimeZone(options.timezone) ? options.timezone : "UTC";
  const l = options.labels;
  const when = (instant: Date | string | null) => {
    if (!instant) return null;
    const { date, time } = formatInstantInZone(new Date(instant), zone);
    return `${date} ${time}`;
  };
  const day = (instant: Date | string | null) =>
    instant ? formatInstantInZone(new Date(instant), zone).date : null;

  const header = [
    l.name,
    l.firstName,
    l.lastName,
    l.email,
    l.status,
    l.registeredAt(zone),
    l.waitlistPlace,
    l.paymentStatus,
    l.memberSince,
    l.earlierEvents,
    l.company,
    l.linkedin,
    l.github,
    l.website,
    l.experience,
    l.skills,
    l.interests,
    ...questions.map((q) => q.label),
  ];

  const lines = rows.map((row) => [
    row.displayName,
    row.firstName,
    row.lastName,
    row.email,
    l.statuses[row.status],
    when(row.registeredAt),
    row.waitlistPosition,
    row.paymentStatus,
    day(row.communityMemberSince),
    row.pastEventsAttended,
    row.profile?.company,
    row.profile?.linkedinUrl,
    row.profile?.githubUrl,
    row.profile?.websiteUrl,
    row.profile?.experienceLevel,
    row.profile?.skills.join("; "),
    row.profile?.interests.join("; "),
    ...questions.map((q) => {
      const value = row.answers.find((a) => a.questionId === q.id)?.value;
      return Array.isArray(value) ? value.join("; ") : value;
    }),
  ]);

  return (
    "﻿" +
    [header, ...lines]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
