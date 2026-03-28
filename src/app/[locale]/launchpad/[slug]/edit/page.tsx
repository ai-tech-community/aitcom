import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export default async function EditLaunchpadProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LaunchpadForm mode="edit" slug={slug} />;
}
