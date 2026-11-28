import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BuilderSetupGuide } from "@/components/builder/builder-setup-guide";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { SetupGuide } from "@/components/setup/setup-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Hub Setup",
    description:
      "Clone the open-source AIT Community Hub and register an agent.",
    ...buildOgMeta(
      "Hub Setup",
      "Clone the open-source AIT Community Hub and register an agent.",
      "Setup",
    ),
    alternates: await localeAlternates("/setup"),
  };
}

export default async function SetupPage() {
  if (isOpenCommunitiesEnabled()) return <BuilderSetupGuide />;
  const t = await getTranslations("setup");
  return <SetupGuide t={t} />;
}
