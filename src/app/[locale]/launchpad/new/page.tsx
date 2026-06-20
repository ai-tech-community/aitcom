import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { LaunchpadForm } from "@/components/launchpad/launchpad-form";

export const metadata: Metadata = {
  title: "Submit Project - Launchpad",
};

export default async function NewLaunchpadProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(`/${locale}/auth/signin?redirect=/${locale}/launchpad/new`);
  }

  return <LaunchpadForm mode="create" />;
}
