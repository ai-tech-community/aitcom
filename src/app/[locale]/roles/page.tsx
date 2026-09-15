import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AitCommunityRolesPage } from "@/components/investigations/ait-community-roles-page";
import {
  AIT_COMMUNITY_ROLES_H1,
  AIT_COMMUNITY_ROLES_META,
  AIT_COMMUNITY_ROLES_PATH,
  resolveSeats,
} from "@/lib/investigations/ait-community-roles";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: AIT_COMMUNITY_ROLES_H1,
    description: AIT_COMMUNITY_ROLES_META,
    robots: { index: true, follow: true },
    ...buildOgMeta(AIT_COMMUNITY_ROLES_H1, AIT_COMMUNITY_ROLES_META, "Roles"),
    alternates: await localeAlternates(AIT_COMMUNITY_ROLES_PATH),
  };
}

export default async function AitCommunityRolesPageRoute() {
  const t = await getTranslations("investigationsAitCommunityRoles");
  const session = await getSession();
  const promoteJoin = shouldPromoteJoin(toHubAuthUser(session?.user));
  return (
    <AitCommunityRolesPage
      t={t}
      seats={resolveSeats()}
      promoteJoin={promoteJoin}
      emptySeatCta={promoteJoin ? t("claimCta") : t("requestCta")}
    />
  );
}
