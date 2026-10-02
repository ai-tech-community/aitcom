import type {
  ProfileWork,
  ProfileWorkCertificate,
} from "@/server/members/profile-work";

export type WorkKind =
  | "article"
  | "project"
  | "course"
  | "certificate"
  | "event";

/** What a row says under its title. */
export type WorkEntryDetail =
  | { type: "stage"; stage: string }
  | { type: "certificate"; outcome: "winner" | "participant" | "course" }
  | null;

/** One row of the Work tab or Recent work, whatever its source. */
export interface WorkEntry {
  key: string;
  kind: WorkKind;
  /** Null for a hackathon certificate whose challenge no longer exists. */
  title: string | null;
  /** Locale-less; null when there is no page to open. */
  href: string | null;
  /** ISO date the row is ordered by. */
  date: string | null;
  detail: WorkEntryDetail;
}

function certificateEntry(cert: ProfileWorkCertificate): WorkEntry {
  if (cert.kind === "course") {
    return {
      key: `certificate-${cert.id}`,
      kind: "certificate",
      title: cert.title,
      href: `/communities/${cert.communitySlug}/classroom/${cert.courseSlug}`,
      date: cert.issuedAt,
      detail: { type: "certificate", outcome: "course" },
    };
  }
  return {
    key: `certificate-${cert.id}`,
    kind: "certificate",
    title: cert.title,
    href: cert.challengeSlug ? `/challenges/${cert.challengeSlug}` : null,
    date: cert.issuedAt,
    detail: { type: "certificate", outcome: cert.outcome },
  };
}

/** Each Work list as rows, in the order the server returned them. */
export function toWorkEntries(
  work: ProfileWork,
): Record<keyof ProfileWork, WorkEntry[]> {
  return {
    articles: work.articles.items.map((article) => ({
      key: `article-${article.id}`,
      kind: "article",
      title: article.title,
      href: `/blog/${article.slug}`,
      date: article.publishedAt,
      detail: null,
    })),
    projects: work.projects.items.map((project) => ({
      key: `project-${project.id}`,
      kind: "project",
      title: project.title,
      href: `/launchpad/${project.slug}`,
      date: project.createdAt,
      detail: { type: "stage", stage: project.stage },
    })),
    courses: work.courses.items.map((course) => ({
      key: `course-${course.id}`,
      kind: "course",
      title: course.title,
      href: `/communities/${course.communitySlug}/classroom/${course.slug}`,
      date: course.createdAt,
      detail: null,
    })),
    certificates: work.certificates.items.map(certificateEntry),
    events: work.events.items.map((event) => ({
      key: `event-${event.id}`,
      kind: "event",
      title: event.title,
      href: `/events/${event.slug}`,
      date: event.date,
      detail: null,
    })),
  };
}

/** The newest `count` rows across every Work list (undated rows last). */
export function recentWork(work: ProfileWork, count: number): WorkEntry[] {
  const time = (entry: WorkEntry) =>
    entry.date ? new Date(entry.date).getTime() : Number.NEGATIVE_INFINITY;
  return Object.values(toWorkEntries(work))
    .flat()
    .sort((a, b) => time(b) - time(a))
    .slice(0, count);
}
