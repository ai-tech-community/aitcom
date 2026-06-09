"use client";

import { use } from "react";
import { TopicsSettings } from "@/components/communities/settings/topics-settings";

export default function TopicsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <TopicsSettings slug={slug} />;
}
