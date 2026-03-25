"use client";

import { use } from "react";
import { ForumPage } from "@/components/forum/forum-page";

export default function CommunityForumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ForumPage communitySlug={slug} />;
}
