export const REGISTRATION_PROVIDERS = ["luma", "eventbrite", "meetup"] as const;
export type RegistrationProvider = (typeof REGISTRATION_PROVIDERS)[number];
export const REGISTRATION_SOURCES = [
  ...REGISTRATION_PROVIDERS,
  "direct_or_unknown",
] as const;
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number];
export type SourceFilter = RegistrationSource | "all";

export function registrationSource(value: unknown): RegistrationSource {
  return REGISTRATION_SOURCES.includes(value as RegistrationSource)
    ? (value as RegistrationSource)
    : "direct_or_unknown";
}

export function sourceFilter(value: unknown): SourceFilter {
  return REGISTRATION_SOURCES.includes(value as RegistrationSource)
    ? (value as RegistrationSource)
    : "all";
}

export interface SourceAttendee {
  registrationSource?: RegistrationSource;
  status: string;
  checkedInAt?: Date | string | null;
  displayName: string;
  email: string | null;
  profile: { company: string | null } | null;
  answers: readonly { value: string | string[] }[];
}

export function filterSourceAttendees<T extends SourceAttendee>(
  rows: readonly T[],
  statuses: readonly string[],
  source: SourceFilter,
  search = "",
): T[] {
  const needle = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      statuses.includes(row.status) &&
      (source === "all" ||
        registrationSource(row.registrationSource) === source) &&
      (!needle ||
        [
          row.displayName,
          row.email,
          row.profile?.company,
          ...row.answers.flatMap((answer) => answer.value),
        ].some((value) => value?.toLowerCase().includes(needle))),
  );
}

export function registrationSourceTotals(
  rows: readonly Pick<
    SourceAttendee,
    "registrationSource" | "status" | "checkedInAt"
  >[],
) {
  return REGISTRATION_SOURCES.map((source) => {
    const matching = rows.filter(
      (row) => registrationSource(row.registrationSource) === source,
    );
    return {
      source,
      registrations: matching.filter((row) =>
        ["registered", "waitlisted", "attended"].includes(row.status),
      ).length,
      checkedIn: matching.filter(
        (row) => row.status === "attended" && row.checkedInAt != null,
      ).length,
    };
  });
}
