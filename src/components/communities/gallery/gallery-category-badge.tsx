"use client";

import { Badge } from "@/components/ui/badge";
import { topicText } from "@/lib/communities/topic-label";
import { api } from "@/trpc/react";

/** A gallery category (a community topic) by its label, as a neutral badge. */
export function GalleryCategoryBadge({
  slug,
  topicSlug,
}: {
  slug: string;
  topicSlug: string;
}) {
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  return (
    <Badge variant="secondary">{topicText(topicSlug, topics ?? [])}</Badge>
  );
}
