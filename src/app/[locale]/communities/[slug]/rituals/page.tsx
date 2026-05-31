"use client";

import { use } from "react";
import { RitualsManager } from "@/components/communities/rituals/rituals-manager";

export default function RitualsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <RitualsManager slug={slug} />;
}
