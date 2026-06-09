"use client";

import { use } from "react";
import { CourseView } from "@/components/classroom/course-view";

export default function CoursePage({
  params,
}: {
  params: Promise<{ slug: string; courseSlug: string }>;
}) {
  const { slug, courseSlug } = use(params);
  return <CourseView slug={slug} courseSlug={courseSlug} />;
}
