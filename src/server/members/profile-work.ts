import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Payload, Where } from "payload";

import type { CommunityRole } from "@/lib/classroom";
import type { Course } from "@/payload-types";
import type { db as appDb } from "@/server/db";
import {
  communities,
  communityMemberships,
  courseCertificates,
  hackathonCertificates,
} from "@/server/db/schema";
import { publicArticleWhere } from "@/server/articles/public-articles";
import {
  resolveCourseAccess,
  type CourseAccessMembership,
} from "@/server/classroom/course-access";
import { communityContentReadableWhere } from "@/server/communities/content-visibility";
import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";

type Db = typeof appDb;
type Locale = "en" | "nl";

/** How many items each Work list shows. */
export const WORK_LIST_LIMIT = 6;

/**
 * How many published courses of one author are read before the viewer's
 * access is applied in code (the course rule lives in `resolveCourseAccess`,
 * not in a Payload `where`).
 */
export const COURSE_SCAN_LIMIT = 100;

/** A capped list, newest first. `hasMore`: there is more than `items`. */
export interface WorkList<T> {
  items: T[];
  hasMore: boolean;
}

export interface ProfileWorkArticle {
  id: number;
  title: string;
  slug: string;
  publishedAt: string | null;
}

export interface ProfileWorkProject {
  id: number;
  title: string;
  slug: string;
  stage: string;
  createdAt: string;
}

export interface ProfileWorkCourse {
  id: number;
  title: string;
  slug: string;
  communitySlug: string;
  createdAt: string;
}

export type ProfileWorkCertificate =
  | {
      kind: "hackathon";
      id: string;
      /** Null when the challenge no longer exists. */
      title: string | null;
      challengeSlug: string | null;
      outcome: "winner" | "participant";
      issuedAt: string;
    }
  | {
      kind: "course";
      id: string;
      title: string;
      courseSlug: string;
      communitySlug: string;
      issuedAt: string;
    };

export interface ProfileWorkEvent {
  id: number;
  title: string;
  slug: string;
  date: string;
}

/**
 * What a member built here, as this viewer may see it. An explicit
 * allow-list: only what the Work tab renders.
 */
export interface ProfileWork {
  articles: WorkList<ProfileWorkArticle>;
  projects: WorkList<ProfileWorkProject>;
  courses: WorkList<ProfileWorkCourse>;
  certificates: WorkList<ProfileWorkCertificate>;
  events: WorkList<ProfileWorkEvent>;
}

/** Event statuses that count as hosted: not draft, rejected or cancelled. */
export const HOSTED_EVENT_STATUSES = ["published", "completed"] as const;

function capped<T>(items: readonly T[], limit = WORK_LIST_LIMIT): WorkList<T> {
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}

function withReadable(conditions: Where[], readable: Where | null): Where {
  return { and: readable ? [...conditions, readable] : conditions };
}

/** Published articles the public may read (the blog rule), by this author. */
export function profileArticlesWhere(userId: string): Where {
  return { and: [{ authorId: { equals: userId } }, publicArticleWhere()] };
}

/** Published launchpad projects in communities the viewer may read. */
export function profileProjectsWhere(
  userId: string,
  hiddenCommunityIds: readonly string[],
): Where {
  return withReadable(
    [{ authorId: { equals: userId } }, { status: { equals: "published" } }],
    communityContentReadableWhere(hiddenCommunityIds),
  );
}

/**
 * Native events this member organises that are (or were) live, in
 * communities the viewer may read. Persisted Luma rows are not native.
 */
export function profileEventsWhere(
  userId: string,
  hiddenCommunityIds: readonly string[],
): Where {
  return withReadable(
    [
      { organizerId: { equals: userId } },
      { status: { in: [...HOSTED_EVENT_STATUSES] } },
      { discoverySource: { not_equals: "luma" } },
    ],
    communityContentReadableWhere(hiddenCommunityIds),
  );
}

/**
 * Published courses by this author. Who may see each one is decided after
 * the read, by `resolveCourseAccess`.
 */
export function profileCoursesWhere(userId: string): Where {
  return {
    and: [
      { authorId: { equals: userId } },
      { status: { equals: "published" } },
    ],
  };
}

type CourseDoc = Pick<
  Course,
  | "id"
  | "title"
  | "slug"
  | "status"
  | "isPublic"
  | "authorId"
  | "communityId"
  | "createdAt"
>;

/**
 * The community context course access needs: the live communities' slugs
 * and the viewer's memberships in them.
 */
export interface CourseCommunityContext {
  viewerId: string | null;
  communitySlugById: ReadonlyMap<string, string>;
  membershipByCommunityId: ReadonlyMap<string, CourseAccessMembership>;
}

/**
 * Whether the viewer may read this published course, and where it lives.
 * Null when they may not (or its community is gone): the course rule
 * (`resolveCourseAccess`) is the only judge, and only published courses
 * are shown on a profile, whoever is looking.
 */
export function readableCourseCommunitySlug(
  course: CourseDoc,
  context: CourseCommunityContext,
): string | null {
  if (course.status !== "published") return null;
  const communitySlug = context.communitySlugById.get(course.communityId);
  if (!communitySlug) return null;
  const access = resolveCourseAccess({
    course,
    viewerId: context.viewerId,
    membership: context.membershipByCommunityId.get(course.communityId) ?? null,
  });
  return access === "none" ? null : communitySlug;
}

async function loadCourseCommunityContext(
  database: Db,
  viewerId: string | null,
  communityIds: readonly string[],
): Promise<CourseCommunityContext> {
  const ids = [...new Set(communityIds)];
  if (ids.length === 0) {
    return {
      viewerId,
      communitySlugById: new Map(),
      membershipByCommunityId: new Map(),
    };
  }
  const [communityRows, membershipRows] = await Promise.all([
    database
      .select({ id: communities.id, slug: communities.slug })
      .from(communities)
      .where(and(inArray(communities.id, ids), isNull(communities.deletedAt))),
    viewerId
      ? database
          .select({
            communityId: communityMemberships.communityId,
            role: communityMemberships.role,
            status: communityMemberships.status,
          })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.userId, viewerId),
              inArray(communityMemberships.communityId, ids),
            ),
          )
      : Promise.resolve([]),
  ]);
  return {
    viewerId,
    communitySlugById: new Map(communityRows.map((row) => [row.id, row.slug])),
    membershipByCommunityId: new Map(
      membershipRows.map((row) => [
        row.communityId,
        { role: row.role as CommunityRole, active: row.status === "active" },
      ]),
    ),
  };
}

/**
 * Load a member's Work as this viewer may see it. The caller checks the
 * profile is visible to the viewer first.
 *
 * Every visibility rule is the shared one: the blog rule for articles,
 * community content readability for projects, events and hackathon
 * certificates, and the course rule for courses and course certificates.
 * Payload is queried once per collection (no per-item reads).
 */
export async function loadProfileWork(
  deps: { db: Db; payload: Pick<Payload, "find"> },
  {
    userId,
    viewerId,
    locale,
  }: { userId: string; viewerId: string | null; locale: Locale },
): Promise<ProfileWork> {
  const { db: database, payload } = deps;
  const listLimit = WORK_LIST_LIMIT + 1;

  const [hidden, hackathonRows, courseCertRows] = await Promise.all([
    hiddenContentCommunityIds(database, viewerId),
    database
      .select({
        id: hackathonCertificates.id,
        challengeId: hackathonCertificates.challengeId,
        kind: hackathonCertificates.kind,
        issuedAt: hackathonCertificates.issuedAt,
      })
      .from(hackathonCertificates)
      .where(eq(hackathonCertificates.userId, userId))
      .orderBy(desc(hackathonCertificates.issuedAt)),
    database
      .select({
        id: courseCertificates.id,
        courseId: courseCertificates.courseId,
        issuedAt: courseCertificates.issuedAt,
      })
      .from(courseCertificates)
      .where(eq(courseCertificates.userId, userId))
      .orderBy(desc(courseCertificates.issuedAt)),
  ]);
  const hiddenSet = new Set(hidden);

  const challengeIds = [...new Set(hackathonRows.map((r) => r.challengeId))];
  const certCourseIds = [...new Set(courseCertRows.map((r) => r.courseId))];

  const [articles, projects, events, authored, challenges, certCourses] =
    await Promise.all([
      payload.find({
        collection: "articles",
        where: profileArticlesWhere(userId),
        sort: "-publishedAt",
        limit: listLimit,
        locale,
        draft: false,
        depth: 0,
      }),
      payload.find({
        collection: "launchpad-projects",
        where: profileProjectsWhere(userId, hidden),
        sort: "-createdAt",
        limit: listLimit,
        depth: 0,
      }),
      payload.find({
        collection: "events",
        where: profileEventsWhere(userId, hidden),
        sort: "-date",
        limit: listLimit,
        locale,
        draft: false,
        depth: 0,
      }),
      payload.find({
        collection: "courses",
        where: profileCoursesWhere(userId),
        sort: "-createdAt",
        limit: COURSE_SCAN_LIMIT,
        depth: 0,
      }),
      challengeIds.length > 0
        ? payload.find({
            collection: "challenges",
            where: { id: { in: challengeIds } },
            limit: challengeIds.length,
            pagination: false,
            depth: 0,
          })
        : null,
      certCourseIds.length > 0
        ? payload.find({
            collection: "courses",
            where: { id: { in: certCourseIds } },
            limit: certCourseIds.length,
            pagination: false,
            depth: 0,
          })
        : null,
    ]);

  const courseContext = await loadCourseCommunityContext(database, viewerId, [
    ...authored.docs.map((course) => course.communityId),
    ...(certCourses?.docs ?? []).map((course) => course.communityId),
  ]);

  const courses = authored.docs.flatMap((course) => {
    const communitySlug = readableCourseCommunitySlug(course, courseContext);
    return communitySlug
      ? [
          {
            id: course.id,
            title: course.title,
            slug: course.slug,
            communitySlug,
            createdAt: course.createdAt,
          },
        ]
      : [];
  });

  const challengeById = new Map(
    (challenges?.docs ?? []).map((challenge) => [challenge.id, challenge]),
  );
  const certCourseById = new Map(
    (certCourses?.docs ?? []).map((course) => [course.id, course]),
  );

  const certificates: ProfileWorkCertificate[] = [
    ...hackathonRows.flatMap((row): ProfileWorkCertificate[] => {
      const challenge = challengeById.get(row.challengeId);
      if (challenge?.communityId && hiddenSet.has(challenge.communityId)) {
        return [];
      }
      return [
        {
          kind: "hackathon",
          id: row.id,
          title: challenge?.title ?? null,
          challengeSlug: challenge?.slug ?? null,
          outcome: row.kind,
          issuedAt: row.issuedAt.toISOString(),
        },
      ];
    }),
    ...courseCertRows.flatMap((row): ProfileWorkCertificate[] => {
      const course = certCourseById.get(row.courseId);
      const communitySlug =
        course && readableCourseCommunitySlug(course, courseContext);
      if (!course || !communitySlug) return [];
      return [
        {
          kind: "course",
          id: row.id,
          title: course.title,
          courseSlug: course.slug,
          communitySlug,
          issuedAt: row.issuedAt.toISOString(),
        },
      ];
    }),
  ].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  return {
    articles: capped(
      articles.docs.map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        publishedAt: article.publishedAt ?? null,
      })),
    ),
    projects: capped(
      projects.docs.map((project) => ({
        id: project.id,
        title: project.title,
        slug: project.slug,
        stage: project.stage,
        createdAt: project.createdAt,
      })),
    ),
    courses: capped(courses),
    certificates: capped(certificates),
    events: capped(
      events.docs.map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        date: event.date,
      })),
    ),
  };
}
