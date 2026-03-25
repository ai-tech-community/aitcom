import { redirect } from "next/navigation";

export default async function ManageCommunityPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  redirect(`/${locale}/dashboard/communities/${slug}/manage/settings`);
}
