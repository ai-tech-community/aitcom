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
