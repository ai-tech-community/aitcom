import { redirect, notFound } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export default async function EditLaunchpadProjectPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(`/${locale}/auth/signin?redirect=/${locale}/launchpad/${slug}/edit`);
  }

  // Only the author may edit. Verify ownership server-side so non-owners get a
  // 404 instead of the editor (the server `update` mutation is the backstop).
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "launchpad-projects",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });

  const project = docs[0];
  if (!project) notFound();
  if (project.authorId !== session.user.id) notFound();

  return <LaunchpadForm mode="edit" slug={slug} />;
}
