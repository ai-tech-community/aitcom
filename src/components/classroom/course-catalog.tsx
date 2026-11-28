import styles from "./classroom.module.css";
import { ArrowRight, ArrowUpRight, BookOpen, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { nextUnfinishedLesson } from "@/lib/classroom";
import { LearningProgress } from "./learning-progress";

type Course = RouterOutputs["classrooms"]["list"][number];

export function CourseCatalog({
  slug,
  courses,
  loading,
  failed,
  mayCreate,
  member = false,
  onRetry,
}: {
  slug: string;
  courses: Course[];
  loading: boolean;
  failed: boolean;
  mayCreate: boolean;
  member?: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");
  const classroom = `/communities/${slug}/classroom`;
  const inProgress = courses.filter(
    (course) =>
      course.enrolled &&
      course.progressPercent > 0 &&
      course.progressPercent < 100,
  );
  const featured = courses.length <= 4 ? inProgress[0] : undefined;
  const moreInProgress = featured ? inProgress.slice(1) : inProgress;
  const otherCourses = courses.filter((course) => !inProgress.includes(course));

  return (
    <div
      data-classroom-redesign=""
      className={`@container mx-auto max-w-5xl space-y-8 py-3 sm:py-7 ${styles.controls}`}
    >
      <header className="border-border flex flex-wrap items-end justify-between gap-4 border-b pb-6 sm:pb-8">
        <div className="space-y-2">
          <h1 className="font-community-heading text-3xl font-semibold tracking-tight sm:text-5xl">
            {t("courses")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("catalogDescription")}
          </p>
        </div>
        {mayCreate ? (
          <Button asChild variant="outline" className="shadow-none">
            <Link href={`${classroom}/new` as never}>
              {existing("createCourse")}
            </Link>
          </Button>
        ) : null}
      </header>

      {loading ? (
        <div
          aria-busy="true"
          aria-label={existing("loading")}
          className="space-y-4"
        >
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : failed ? (
        <ErrorState onRetry={onRetry} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("emptyCatalog")}
          description={
            mayCreate ? t("emptyCatalogAuthor") : t("emptyCatalogVisitor")
          }
          action={
            mayCreate ? null : (
              <Button asChild variant="outline">
                <Link href={`/communities/${slug}` as never}>
                  {t("communityHome")}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {inProgress.length > 0 ? (
            <CatalogSection
              title={t("continueLearning")}
              courses={moreInProgress}
              classroom={classroom}
              featured={featured}
              member={member}
            />
          ) : null}
          {otherCourses.length > 0 ? (
            <CatalogSection
              title={t("courseCatalog")}
              courses={otherCourses}
              classroom={classroom}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function FeaturedCourse({
  course,
  classroom,
  member,
  title,
}: {
  course: Course;
  classroom: string;
  member: boolean;
  title: string;
}) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");
  const href = `${classroom}/${course.slug}`;
  const { data, isLoading, isError } = api.classrooms.get.useQuery({
    slug: course.slug,
  });
  const resume =
    data?.enrolled && !isError
      ? nextUnfinishedLesson(data.lessons, new Set(data.completedLessonIds))
      : undefined;
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="grid min-w-0 @2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)]">
        <div className="space-y-4 p-5 sm:p-7">
          <SectionLabel bordered={false}>{title}</SectionLabel>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
              <Link
                href={href as never}
                className="focus-visible:ring-ring rounded-sm underline-offset-4 hover:underline focus-visible:ring-2"
              >
                {course.title}
              </Link>
            </h3>
            {course.summary ? (
              <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
                {course.summary}
              </p>
            ) : null}
            {course.authorName ? (
              <p className="text-muted-foreground text-sm">
                {existing("byAuthor", { name: course.authorName })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="border-border bg-muted/35 flex flex-col justify-center gap-4 border-t p-5 sm:p-7 @2xl:border-t-0 @2xl:border-l">
          <LearningProgress percent={course.progressPercent} />
          {isLoading ? (
            <Skeleton
              aria-label={existing("loading")}
              aria-busy="true"
              className="h-11 w-44 max-w-full"
            />
          ) : resume ? (
            <Button
              asChild
              variant={member ? "default" : "ink"}
              className="h-auto min-h-11 w-fit max-w-full justify-between text-left whitespace-normal"
            >
              <Link href={`${href}?resume=1` as never}>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {t("resumeLesson", { title: resume.title })}
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CatalogSection({
  title,
  courses,
  classroom,
  featured,
  member = false,
}: {
  title: string;
  courses: Course[];
  classroom: string;
  featured?: Course;
  member?: boolean;
}) {
  const t = useTranslations("redesign.classroom");
  const existing = useTranslations("classroom");

  return (
    <section>
      {featured ? (
        <FeaturedCourse
          course={featured}
          classroom={classroom}
          member={member}
          title={title}
        />
      ) : (
        <SectionLabel className="pb-3">{title}</SectionLabel>
      )}
      {courses.length > 0 ? (
        <ul
          className={
            featured ? "divide-border mt-8 divide-y" : "divide-border divide-y"
          }
        >
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`${classroom}/${course.slug}` as never}
                className="hover:bg-muted/60 focus-visible:ring-ring group grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-3 rounded-md px-1 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset @xl:grid-cols-[10rem_minmax(0,1fr)_auto] @xl:items-center @xl:gap-6 @xl:px-3"
              >
                {course.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- author cover hosts are unrestricted
                  <img
                    src={course.coverImageUrl}
                    alt=""
                    className="bg-muted aspect-square w-full rounded-lg object-cover @xl:aspect-[3/2]"
                  />
                ) : (
                  <div className="bg-muted text-muted-foreground grid aspect-square w-full place-items-center rounded-lg @xl:aspect-[3/2]">
                    <BookOpen
                      className="size-5 @xl:size-8"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-lg font-semibold tracking-tight [overflow-wrap:anywhere] @xl:text-2xl">
                      {course.title}
                    </h3>
                    {course.status !== "published" ? (
                      <span className="text-muted-foreground text-xs">
                        {course.status === "draft"
                          ? existing("draft")
                          : existing("archivedBadge")}
                      </span>
                    ) : null}
                  </div>
                  {course.summary ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm [overflow-wrap:anywhere]">
                      {course.summary}
                    </p>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {course.authorName ? (
                      <span>
                        {existing("byAuthor", { name: course.authorName })}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("learnerCount", {
                        count: course.enrollmentCount ?? 0,
                      })}
                    </span>
                  </div>
                  {course.progressPercent > 0 ? (
                    <div className="max-w-56 pt-1">
                      <LearningProgress percent={course.progressPercent} />
                    </div>
                  ) : null}
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="text-muted-foreground mt-1 size-4 @xl:mt-0 @xl:size-5"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
