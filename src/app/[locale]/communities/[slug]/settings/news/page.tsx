import { NewsSourcesSettings } from "@/components/communities/settings/news-sources-settings";

export default async function NewsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NewsSourcesSettings key={slug} slug={slug} />;
}
