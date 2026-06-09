"use client";

import { use } from "react";
import { ClassroomListing } from "@/components/classroom/classroom-listing";

export default function CommunityClassroomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ClassroomListing slug={slug} />;
}
