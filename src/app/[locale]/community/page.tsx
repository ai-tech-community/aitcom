import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunityBoard } from "@/components/community/community-board";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Join discussions, share ideas, and connect with AI practitioners in the Netherlands.",
  ...buildOgMeta(
    "Community",
    "Join discussions, share ideas, and connect with AI practitioners in the Netherlands.",
    "Community",
  ),
  alternates: buildAlternates("/community"),
};

export default function CommunityPage() {
  return <CommunityBoard />;
}
