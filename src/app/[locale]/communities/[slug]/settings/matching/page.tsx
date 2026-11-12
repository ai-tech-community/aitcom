"use client";

import { use } from "react";
import { MatchingSettings } from "@/components/communities/settings/matching-settings";

export default function MatchingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <MatchingSettings key={slug} slug={slug} />;
}
