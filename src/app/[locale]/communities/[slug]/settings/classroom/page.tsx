"use client";

import { use } from "react";
import { ClassroomSettings } from "@/components/communities/settings/classroom-settings";

export default function ClassroomSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ClassroomSettings slug={slug} />;
}
