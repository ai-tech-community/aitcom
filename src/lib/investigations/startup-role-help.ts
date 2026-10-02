/**
 * Why asking a community for help with a tracked role was refused. The
 * server throws these as the TRPCError message; the Job tracker maps each
 * to its own translated sentence. `RULES_NOT_ACCEPTED` is the code every
 * community write uses.
 */
export const ROLE_HELP_ERRORS = [
  "NOTE_REQUIRED",
  "ROLE_NOT_TRACKED",
  "ROLE_NOT_FOUND",
  "COMMUNITY_NOT_FOUND",
  "NOT_A_MEMBER",
  "RULES_NOT_ACCEPTED",
  "CLASSROOM_NOT_FOUND",
] as const;

export type RoleHelpError = (typeof ROLE_HELP_ERRORS)[number];

/** The known refusal behind an error message, or null for anything else. */
export function roleHelpErrorOf(
  message: string | null | undefined,
): RoleHelpError | null {
  return (ROLE_HELP_ERRORS as readonly string[]).includes(message ?? "")
    ? (message as RoleHelpError)
    : null;
}

export type RoleHelpPost = {
  title: string;
  content: string;
};

export type RoleHelpRequest = {
  roleId: string;
  communitySlug: string;
  communityName: string;
  note: string;
  classroom: string;
  path: string;
};

type HelpLocale = "en" | "nl";

const LABELS = {
  en: {
    title: (roleTitle: string) => `Help with ${roleTitle}`,
    posting: "Original posting",
    listed: "Listed on AIT",
    classroom: "Classroom",
  },
  nl: {
    title: (roleTitle: string) => `Hulp bij ${roleTitle}`,
    posting: "Originele vacature",
    listed: "Op AIT",
    classroom: "Classroom",
  },
} as const;

export function matchCommunityClassroom(
  courses: readonly { title: string; slug: string }[],
  name: string,
): { title: string; slug: string } | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return (
    courses.find(
      (course) =>
        course.title.trim().toLowerCase() === wanted ||
        course.slug.trim().toLowerCase() === wanted,
    ) ?? null
  );
}

export function buildRoleHelpPost(input: {
  locale: HelpLocale;
  roleTitle: string;
  startupName: string;
  rolePath: string;
  sourceUrl: string;
  note: string;
  classroomTitle?: string | null;
  classroomPath?: string | null;
}): RoleHelpPost {
  const labels = input.locale === "nl" ? LABELS.nl : LABELS.en;
  const blocks = [
    input.note.trim(),
    input.roleTitle,
    input.startupName,
    `${labels.posting}: ${input.sourceUrl}`,
    `${labels.listed}: ${input.rolePath}`,
  ];
  if (input.classroomTitle && input.classroomPath) {
    blocks.push(
      `${labels.classroom}: ${input.classroomTitle}`,
      input.classroomPath,
    );
  }
  return {
    title: labels.title(input.roleTitle).slice(0, 255),
    content: blocks.filter(Boolean).join("\n\n"),
  };
}

export function roleHelpThreadPath(
  communitySlug: string,
  threadSlug: string,
): string {
  return `/communities/${communitySlug}/forum/${threadSlug}`;
}
