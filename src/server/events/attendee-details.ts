import { and, count, eq, inArray, ne } from "drizzle-orm";

import {
  ATTENDEE_STATUSES,
  type AttendeeStatus,
} from "@/lib/events/attendee-views";
import {
  resolveAnswers,
  type RegistrationQuestion,
  type ResolvedAnswer,
} from "@/lib/events/registration-questions";
import type { db as Db } from "@/server/db";
import {
  communityMemberships,
  eventRegistrations,
  memberProfiles,
  user,
} from "@/server/db/schema";

/**
 * Attendee details (ADR-0038): what the event organizer sees about one
 * registration. `toAttendeeDetails` is the only place the privacy rule
 * lives; the page, the CSV and check-in all get rows from
 * `loadEventAttendees`, so no surface can forget it.
 */

export {
  ATTENDEE_STATUSES,
  type AttendeeStatus,
} from "@/lib/events/attendee-views";

export interface PublicProfileDetails {
  company: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  experienceLevel: string | null;
  skills: string[];
  interests: string[];
}

export interface AttendeeDetails {
  registrationId: string;
  firstName: string | null;
  lastName: string | null;
  /** Always present: first + last name, else the name the member goes by. */
  displayName: string;
  /** Null when the member registered before the sharing notice (spec §7). */
  email: string | null;
  /** False when registered before the sharing notice: name and status only. */
  detailsShared: boolean;
  status: AttendeeStatus;
  registeredAt: Date;
  /** 1-based place on the waitlist; waitlisted rows only. */
  waitlistPosition: number | null;
  paymentStatus: string | null;
  /** When the organizer checked them in at the event; null if not. */
  checkedInAt: Date | null;
  /** Null: not an active member of the hosting community. */
  communityMemberSince: Date | null;
  /** Events of this community, before this one, the member attended. */
  pastEventsAttended: number;
  /** Null when the profile is private or missing, or details are not shared. */
  profile: PublicProfileDetails | null;
  /**
   * Answers to the event's registration questions, in question order. The
   * member wrote them for the organizer, so a private profile does not hide
   * them; registering before the sharing notice does.
   */
  answers: ResolvedAnswer[];
}

/** Everything the loader gathers for one registration. */
export interface AttendeeSourceRow {
  registrationId: string;
  status: AttendeeStatus;
  registeredAt: Date;
  paymentStatus: string | null;
  checkedInAt: Date | null;
  organizerNoticeAt: Date | null;
  account: {
    name: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  profile: {
    displayName: string;
    isPublic: boolean;
    company: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
    experienceLevel: string | null;
    skills: string[] | null;
    interests: string[] | null;
  } | null;
  waitlistPosition: number | null;
  communityMemberSince: Date | null;
  pastEventsAttended: number;
  /** Already resolved against the event's current questions. */
  answers: ResolvedAnswer[];
}

/**
 * One registration as the organizer may see it:
 * - registered before the sharing notice → name and status only (no email,
 *   no profile), because the member was never told;
 * - private profile ([[profile-visibility]]) → no profile details. The
 *   staff-only `hiddenFromPublic` flag governs the /members directory, not
 *   this, and is ignored.
 */
export function toAttendeeDetails(row: AttendeeSourceRow): AttendeeDetails {
  const detailsShared = row.organizerNoticeAt !== null;
  const { account, profile } = row;
  const fullName = [account.firstName, account.lastName]
    .filter((part) => part?.trim())
    .join(" ");

  return {
    registrationId: row.registrationId,
    firstName: account.firstName,
    lastName: account.lastName,
    // First non-empty of: account names, profile name, account name.
    displayName:
      [fullName, profile?.displayName, account.name].find((n) => n?.trim()) ??
      "Member",
    email: detailsShared ? account.email : null,
    detailsShared,
    status: row.status,
    registeredAt: row.registeredAt,
    waitlistPosition: row.status === "waitlisted" ? row.waitlistPosition : null,
    paymentStatus: row.paymentStatus,
    checkedInAt: row.checkedInAt,
    communityMemberSince: row.communityMemberSince,
    pastEventsAttended: row.pastEventsAttended,
    answers: detailsShared ? row.answers : [],
    profile:
      detailsShared && profile?.isPublic
        ? {
            company: profile.company,
            linkedinUrl: profile.linkedinUrl,
            githubUrl: profile.githubUrl,
            websiteUrl: profile.websiteUrl,
            experienceLevel: profile.experienceLevel,
            skills: profile.skills ?? [],
            interests: profile.interests ?? [],
          }
        : null,
  };
}

export interface EventAttendees {
  counts: Record<AttendeeStatus, number>;
  rows: AttendeeDetails[];
}

/**
 * Every registration of a native event, as attendee details, oldest first.
 * One query per concern — registrations with account and profile; community
 * memberships; past attendance — never one per attendee. `intent` rows
 * belong to external events and are left out.
 *
 * `earlierEventIds` are this community's events before this one (the caller
 * reads them from Payload), for the past-attendance count.
 */
export async function loadEventAttendees(
  db: typeof Db,
  event: {
    id: number;
    communityId: string;
    questions: readonly RegistrationQuestion[];
  },
  earlierEventIds: readonly number[],
): Promise<EventAttendees> {
  const registrations = await db
    .select({
      registrationId: eventRegistrations.id,
      userId: eventRegistrations.userId,
      status: eventRegistrations.status,
      registeredAt: eventRegistrations.registeredAt,
      paymentStatus: eventRegistrations.paymentStatus,
      checkedInAt: eventRegistrations.checkedInAt,
      organizerNoticeAt: eventRegistrations.organizerNoticeAt,
      answers: eventRegistrations.answers,
      name: user.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: memberProfiles.displayName,
      isPublic: memberProfiles.isPublic,
      company: memberProfiles.company,
      linkedinUrl: memberProfiles.linkedinUrl,
      githubUrl: memberProfiles.githubUrl,
      websiteUrl: memberProfiles.websiteUrl,
      experienceLevel: memberProfiles.experienceLevel,
      skills: memberProfiles.skills,
      interests: memberProfiles.interests,
    })
    .from(eventRegistrations)
    .innerJoin(user, eq(eventRegistrations.userId, user.id))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(
      and(
        eq(eventRegistrations.eventId, event.id),
        ne(eventRegistrations.status, "intent"),
      ),
    )
    .orderBy(eventRegistrations.registeredAt);

  const userIds = [...new Set(registrations.map((r) => r.userId))];

  const [memberships, attendance] =
    userIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              userId: communityMemberships.userId,
              joinedAt: communityMemberships.joinedAt,
            })
            .from(communityMemberships)
            .where(
              and(
                eq(communityMemberships.communityId, event.communityId),
                eq(communityMemberships.status, "active"),
                inArray(communityMemberships.userId, userIds),
              ),
            ),
          earlierEventIds.length === 0
            ? Promise.resolve([] as { userId: string; attended: number }[])
            : db
                .select({
                  userId: eventRegistrations.userId,
                  attended: count(),
                })
                .from(eventRegistrations)
                .where(
                  and(
                    inArray(eventRegistrations.eventId, [...earlierEventIds]),
                    eq(eventRegistrations.status, "attended"),
                    inArray(eventRegistrations.userId, userIds),
                  ),
                )
                .groupBy(eventRegistrations.userId),
        ]);

  const memberSince = new Map(memberships.map((m) => [m.userId, m.joinedAt]));
  const attended = new Map(
    attendance.map((a) => [a.userId, Number(a.attended)]),
  );

  let waitlistPlace = 0;
  const rows = registrations.map((r) =>
    toAttendeeDetails({
      registrationId: r.registrationId,
      status: r.status as AttendeeStatus,
      registeredAt: r.registeredAt,
      paymentStatus: r.paymentStatus,
      checkedInAt: r.checkedInAt,
      organizerNoticeAt: r.organizerNoticeAt,
      account: {
        name: r.name,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
      },
      profile:
        r.displayName === null
          ? null
          : {
              displayName: r.displayName,
              isPublic: r.isPublic ?? false,
              company: r.company,
              linkedinUrl: r.linkedinUrl,
              githubUrl: r.githubUrl,
              websiteUrl: r.websiteUrl,
              experienceLevel: r.experienceLevel,
              skills: r.skills,
              interests: r.interests,
            },
      // Registrations come oldest first, so the waitlist order is theirs.
      waitlistPosition: r.status === "waitlisted" ? ++waitlistPlace : null,
      communityMemberSince: memberSince.get(r.userId) ?? null,
      pastEventsAttended: attended.get(r.userId) ?? 0,
      answers: resolveAnswers(event.questions, r.answers),
    }),
  );

  const counts = Object.fromEntries(
    ATTENDEE_STATUSES.map((status) => [status, 0]),
  ) as Record<AttendeeStatus, number>;
  for (const row of rows) counts[row.status]++;

  return { counts, rows };
}
