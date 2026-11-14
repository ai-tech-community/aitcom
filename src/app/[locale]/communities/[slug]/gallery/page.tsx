import { GalleryPage } from "@/components/communities/gallery/gallery-page";

/** `/communities/{slug}/gallery` — the community's photo and video wall. */
export default async function CommunityGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GalleryPage slug={slug} />;
}
