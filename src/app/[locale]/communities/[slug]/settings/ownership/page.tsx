"use client";

import { use } from "react";
import { OwnershipSettings } from "@/components/communities/settings/ownership-settings";

export default function OwnershipSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <OwnershipSettings slug={slug} />;
}
