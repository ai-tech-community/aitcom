"use client";

import { use } from "react";
import { LinksSettings } from "@/components/communities/settings/links-settings";

export default function LinksSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <LinksSettings slug={slug} />;
}
