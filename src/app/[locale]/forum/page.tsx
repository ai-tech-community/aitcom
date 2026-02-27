import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { ForumPage } from "@/components/forum/forum-page";

export const metadata: Metadata = {
  title: "Forum — AIT",
  description:
    "Ask, share, connect with the AIT community",
  ...buildOgMeta(
    "Forum",
    "Ask, share, connect with the AIT community",
    "Forum",
  ),
  alternates: buildAlternates("/forum"),
};

export default function Page() {
  return <ForumPage />;
}
