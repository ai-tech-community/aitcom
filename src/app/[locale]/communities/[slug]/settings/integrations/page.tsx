"use client";

import { use } from "react";
import { IntegrationsSettings } from "@/components/communities/settings/integrations-settings";

export default function IntegrationsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <IntegrationsSettings slug={slug} />;
}
