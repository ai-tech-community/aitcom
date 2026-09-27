import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
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

  // Author-only editing: anyone else goes to the course page instead of a
  // builder that would fail on the first save (Gate-Before-Fail). The server
  // mutations stay the backstop.
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "courses",
    where: { slug: { equals: courseSlug } },
    limit: 1,
    depth: 0,
  });
  const course = docs[0];
  if (course?.authorId !== session.user.id) {
    redirect(`/${locale}/communities/${slug}/classroom/${courseSlug}`);
  }

  return <CourseBuilder slug={slug} courseSlug={courseSlug} />;
}
