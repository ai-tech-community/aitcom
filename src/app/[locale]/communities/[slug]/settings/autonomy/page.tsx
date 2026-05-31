"use client";

import { use } from "react";
import { AutonomySettings } from "@/components/communities/settings/autonomy-settings";

export default function AutonomySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <AutonomySettings slug={slug} />;
}
