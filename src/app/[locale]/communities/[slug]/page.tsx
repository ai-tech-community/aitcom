import type { Metadata } from "next";
import { api } from "@/trpc/server";
import { getSession } from "@/server/better-auth/server";
import type { HubAuthUser } from "@/server/better-auth/hub-session";
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

export default async function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  const initialUser: HubAuthUser | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }
    : null;
  return (
    <CommunityOverviewPageClient params={params} initialUser={initialUser} />
  );
}
