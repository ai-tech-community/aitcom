"use client";

import { use } from "react";
import { InvitesSettings } from "@/components/communities/settings/invites-settings";

export default function InvitesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <InvitesSettings slug={slug} />;
}
