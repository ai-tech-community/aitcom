import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MethodGuide } from "@/components/datacenters/method-guide";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "How we flag AI datacenters",
  description:
    "Stable cite: how the three descriptive flags on the AI Datacenters investigation are computed from the live dataset. Descriptive, not editorial.",
  ...buildOgMeta(
    "How we flag AI datacenters",
    "How the three descriptive flags are computed from the live dataset. Descriptive, not editorial.",
    "Datacenters",
  ),
  alternates: buildAlternates("/investigations/datacenters/method"),
};

export default async function DatacentersMethodPage() {
  const t = await getTranslations("datacenterMethod");
  return <MethodGuide t={t} />;
}
