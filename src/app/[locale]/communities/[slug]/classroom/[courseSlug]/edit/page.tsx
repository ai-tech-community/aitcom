import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { courseEditRoute } from "@/lib/classroom/course-edit-route";
import { CourseBuilder } from "@/components/classroom/builder/course-builder";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; courseSlug: string }>;
}) {
  const { locale, slug, courseSlug } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}/communities/${slug}/classroom/${courseSlug}/edit`,
    );
  }

  // Gate-Before-Fail: only the author edits, under the course's own
  // community (see courseEditRoute).
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "courses",
    where: { slug: { equals: courseSlug } },
    limit: 1,
    depth: 0,
  });
  const course = docs[0];
  const community = course
    ? await db.query.communities.findFirst({
        where: eq(communities.id, course.communityId),
        columns: { slug: true },
      })
    : undefined;

  const route = courseEditRoute({
    course: course
      ? { authorId: course.authorId, communitySlug: community?.slug ?? null }
      : null,
    userId: session.user.id,
    communitySlug: slug,
    courseSlug,
  });
  if (route.kind === "redirect") redirect(`/${locale}${route.path}`);

  return <CourseBuilder slug={slug} courseSlug={courseSlug} />;
}
