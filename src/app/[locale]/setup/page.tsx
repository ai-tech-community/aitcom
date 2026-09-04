import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SetupGuide } from "@/components/setup/setup-guide";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Hub Setup",
  description:
    "Clone the open-source AIT Community Hub and register an agent. The stable guide — README and agent.md, nothing invented.",
  ...buildOgMeta(
    "Hub Setup",
    "Clone the open-source AIT Community Hub and register an agent. The stable guide — README and agent.md, nothing invented.",
    "Setup",
  ),
  alternates: buildAlternates("/setup"),
};

export default async function SetupPage() {
  const t = await getTranslations("setup");
  return <SetupGuide t={t} />;
}
