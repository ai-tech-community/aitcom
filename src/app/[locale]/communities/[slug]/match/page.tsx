"use client";

import { use } from "react";
import { FindAMatch } from "@/components/communities/matching/find-a-match";

export default function CommunityFindAMatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <FindAMatch key={slug} slug={slug} />;
}
