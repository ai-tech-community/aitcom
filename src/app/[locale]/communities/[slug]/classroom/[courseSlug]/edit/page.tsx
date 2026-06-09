"use client";

import { use } from "react";
import { CourseEditor } from "@/components/classroom/course-editor";

export default function EditCoursePage({
  params,
}: {
  params: Promise<{ slug: string; courseSlug: string }>;
}) {
  const { slug, courseSlug } = use(params);
  return <CourseEditor slug={slug} courseSlug={courseSlug} />;
}
