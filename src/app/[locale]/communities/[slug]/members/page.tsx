"use client";

import { use } from "react";
import { CommunityMembersHub } from "@/components/communities/matching/members-hub";

export default function CommunityMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <CommunityMembersHub key={slug} slug={slug} />;
}
