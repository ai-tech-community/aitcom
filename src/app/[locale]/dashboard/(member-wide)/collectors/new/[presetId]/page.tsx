import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { StartRunForm } from "@/components/collectors/start-run-form";
import { permanentRedirect } from "@/i18n/navigation";
import { readStartQuery, startHref } from "@/lib/collectors/start-address";
import { collectorsEnabled } from "@/server/collectors/flags";
import { presetIdForFormerId } from "@/server/collectors/presets/former-start-ids";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Start a run from one preset, pre-filled from the query (a pasted link).
 * Addresses from before presets named a collector (`/new/feed-items`); they
 * redirect permanently, query kept, to the preset that replaced it, so each
 * preset has one address.
 */
export default async function StartCollectorRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ presetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const [{ presetId }, query] = await Promise.all([params, searchParams]);
  const { prefill, recognised } = readStartQuery(query);
  const current = presetIdForFormerId(presetId);
  if (current) {
    permanentRedirect({
      href: startHref(current, { prefill, recognised }),
      locale: await getLocale(),
    });
  }
  return (
    <StartRunForm
      presetId={presetId}
      prefill={prefill}
      recognised={recognised}
    />
  );
}
