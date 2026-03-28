"use client";

import { use } from "react";
import { RulesSettings } from "@/components/communities/settings/rules-settings";

export default function RulesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <RulesSettings slug={slug} />;
}
