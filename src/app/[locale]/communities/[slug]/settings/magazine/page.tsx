"use client";

import { use } from "react";

import { MagazineSettingsForm } from "@/components/magazines/editor/magazine-settings-form";

export default function MagazineSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <MagazineSettingsForm slug={slug} />;
}
