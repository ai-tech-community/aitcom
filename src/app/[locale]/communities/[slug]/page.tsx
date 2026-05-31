import type { Metadata } from "next";
import { api } from "@/trpc/server";
import { CommunityOverviewPageClient } from "./_overview-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await api.communities.getBySlug({ slug });
    const title = `${c.name} · AI Tech Community`;
    const description =
      c.description ?? `Join ${c.name} on the AI Tech Community Hub.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: c.logoUrl ? [{ url: c.logoUrl }] : undefined,
        type: "website",
      },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: "Community · AI Tech Community" };
  }
}

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <CommunityOverviewPageClient params={params} />;
}
