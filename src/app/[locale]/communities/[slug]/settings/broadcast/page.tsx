"use client";

import { use } from "react";
import { BroadcastComposer } from "@/components/communities/settings/broadcast-composer";

export default function BroadcastSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <BroadcastComposer slug={slug} />;
}
