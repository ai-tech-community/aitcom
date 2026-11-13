import { notFound } from "next/navigation";

import { GalleryPage } from "@/components/communities/gallery/gallery-page";
import { galleryEnabled } from "@/server/gallery/flag";

// The rollout flag is read on every request, never baked into a build.
export const dynamic = "force-dynamic";

/** `/communities/{slug}/gallery` — a 404 while the gallery is switched off. */
export default async function CommunityGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!galleryEnabled()) notFound();
  const { slug } = await params;
  return <GalleryPage slug={slug} />;
}
