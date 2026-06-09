"use client";

import { use } from "react";
import { CourseEditor } from "@/components/classroom/course-editor";

export default function NewCoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <CourseEditor slug={slug} />;
}
