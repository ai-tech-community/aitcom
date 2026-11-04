import { resolveLocale } from "@/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StartupsProfilePage } from "@/components/investigations/startups-profile";
import { startupProfileRobots } from "@/lib/investigations/startup-profile-index";
import {
  buildInvestigationStartupPath,
  startupLegacyKind,
  type StartupLegacyKind,
} from "@/lib/investigations/startup-url-policy";
import {
  buildStartupProfilePath,
  parseStartupSlug,
  startupProfileMetaDescription,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import {
  buildOgMeta,
  localeAlternates,
  localeLanguageAlternates,
} from "@/lib/metadata";
import {
  shouldPromoteJoin,
  toHubAuthUser,
} from "@/server/better-auth/hub-session";
import { getSession } from "@/server/better-auth/server";
import { listStartupNewsMentions } from "@/server/news/startup-links";
import {
  findApprovedPublicStartupBySlug,
  listOpenStartupRolesForCompany,
} from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

type LoadedLegacy =
  | { kind: "missing" }
  | { kind: "redirect" }
  | { kind: "holdout"; card: StartupPublicCard }
  | { kind: "canonical"; card: StartupPublicCard };

async function loadLegacy(slug: string): Promise<LoadedLegacy> {
  const parsed = parseStartupSlug(slug);
  if (!parsed) return { kind: "missing" };
  const card = await findApprovedPublicStartupBySlug(parsed);
  const kind: StartupLegacyKind = startupLegacyKind(parsed, card?.slug ?? null);
  switch (kind) {
    case "missing":
    case "redirect":
      return { kind };
    case "holdout":
    case "canonical":
      if (!card) return { kind: "missing" };
      return { kind, card };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadLegacy(slug);
  switch (loaded.kind) {
    case "missing":
    case "redirect": {
      const t = await getTranslations("investigationsStartups");
      return { title: t("profileNotFound") };
    }
    case "holdout":
    case "canonical": {
      const card = loaded.card;
      const locale = await getLocale();
      const copyLocale: StartupLocale = resolveLocale(locale);
      const description = startupProfileMetaDescription(card, copyLocale);
      const alternates =
        loaded.kind === "holdout"
          ? await localeLanguageAlternates(
              buildInvestigationStartupPath(card.slug),
            )
          : await localeAlternates(buildStartupProfilePath(card.slug));
      return {
        title: card.name,
        ...(description ? { description } : {}),
        robots: startupProfileRobots(card),
        ...(description
          ? buildOgMeta(card.name, description, "Investigation")
          : {}),
        alternates,
      };
    }
    default: {
      const exhaustive: never = loaded;
      return exhaustive;
    }
  }
}

export default async function InvestigationStartupRoute({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadLegacy(slug);
  switch (loaded.kind) {
    case "missing":
    case "redirect":
      // Same-entity profiles 301 in middleware before this renders.
      return notFound();
    case "holdout":
    case "canonical":
      break;
    default: {
      const exhaustive: never = loaded;
      return exhaustive;
    }
  }

  const card = loaded.card;
  const locale = await getLocale();
  const t = await getTranslations("investigationsStartups");
  const session = await getSession();
  const [roles, mentions] = await Promise.all([
    listOpenStartupRolesForCompany(card.id),
    listStartupNewsMentions(card.id).catch((err: unknown) => {
      console.error("startup profile: could not list news", err);
      return [];
    }),
  ]);

  return (
    <StartupsProfilePage
      locale={locale}
      t={t}
      card={card}
      roles={roles}
      mentions={mentions}
      promoteJoin={shouldPromoteJoin(toHubAuthUser(session?.user))}
    />
  );
}
