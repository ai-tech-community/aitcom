import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunityBoard } from "@/components/community/community-board";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Community",
    description:
      "Join discussions, share ideas, and connect with AI practitioners in the Netherlands.",
    ...buildOgMeta(
      "Community",
      "Join discussions, share ideas, and connect with AI practitioners in the Netherlands.",
      "Community",
    ),
    alternates: await localeAlternates("/community"),
  };
}

export default function CommunityPage() {
  return <CommunityBoard />;
}
