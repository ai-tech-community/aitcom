"use client";

import { use } from "react";
import { RoomView } from "@/components/communities/rooms/room-view";

export default function RoomPage({
  params,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
}) {
  const { slug, spaceSlug } = use(params);
  return <RoomView slug={slug} spaceSlug={spaceSlug} />;
}
