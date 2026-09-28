"use client";

import { use } from "react";
import { NewCourseForm } from "@/components/classroom/new-course-form";

export default function NewCoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <NewCourseForm slug={slug} />;
}
