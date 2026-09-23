import "server-only";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import {
  DATACENTER_TABS,
  datacenterTabPath,
  type DatacenterTabKey,
} from "@/lib/investigations/datacenter-investigation-routes";

/** Metadata for one investigation tab. The Facilities index keeps the investigation's own title. */
export async function datacenterTabMetadata(
  key: DatacenterTabKey,
): Promise<Metadata> {
  const t = await getTranslations("datacenterInvestigation");
  const tab = DATACENTER_TABS.find((x) => x.key === key)!;
  const investigation = t("title");
  const title = tab.segment
    ? `${t(`tabs.${key}`)} · ${investigation}`
    : investigation;
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, "Datacenters"),
    alternates: await localeAlternates(datacenterTabPath(tab.segment)),
  };
}
