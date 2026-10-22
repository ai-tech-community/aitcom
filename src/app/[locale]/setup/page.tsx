import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("setup");
  return <SetupGuide t={t} />;
}
