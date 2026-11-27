"use client";

import { use } from "react";
import { ThemeSettings } from "@/components/communities/settings/theme-settings";

export default function ThemesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ThemeSettings slug={slug} />;
}
