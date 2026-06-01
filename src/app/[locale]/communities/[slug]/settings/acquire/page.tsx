"use client";

import { use } from "react";
import { AcquireSettings } from "@/components/communities/acquire/acquire-settings";

export default function AcquireSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <AcquireSettings slug={slug} />;
}
