import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MethodGuide } from "@/components/datacenters/method-guide";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "How we flag AI datacenters",
    description:
      "How the three descriptive flags on the AI Datacenters investigation are calculated.",
    ...buildOgMeta(
      "How we flag AI datacenters",
      "How the three descriptive flags on the AI Datacenters investigation are calculated.",
      "Datacenters",
    ),
    alternates: await localeAlternates("/investigations/datacenters/method"),
  };
}

export default async function DatacentersMethodPage() {
  const t = await getTranslations("datacenterMethod");
  return <MethodGuide t={t} />;
}
