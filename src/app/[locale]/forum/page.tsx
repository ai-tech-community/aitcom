import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { ForumPage } from "@/components/forum/forum-page";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Forum — AIT",
    description: "Ask, share, connect with the AIT community",
    ...buildOgMeta(
      "Forum",
      "Ask, share, connect with the AIT community",
      "Forum",
    ),
    alternates: await localeAlternates("/forum"),
  };
}

export default function Page() {
  return <ForumPage />;
}
