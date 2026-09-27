"use client";

import { use } from "react";
import { CommunityEvents } from "@/components/communities/events/community-events";

export default function CommunityEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <CommunityEvents slug={slug} />;
}
