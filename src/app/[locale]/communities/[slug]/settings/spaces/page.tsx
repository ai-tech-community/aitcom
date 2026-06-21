"use client";

import { use } from "react";
import { ComposeSpaces } from "@/components/communities/settings/compose-spaces";

export default function SpacesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ComposeSpaces slug={slug} />;
}
