import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Bot } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import { profileTabHref } from "@/lib/member-profile-routes";
import {
  getMemberAgentPage,
  requireMemberFrame,
} from "@/server/members/profile-page";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { OwnerOnlyNotice } from "@/components/members/owner-only-notice";
import { VerifiedSocials } from "@/components/verified-socials";

type Params = Promise<{ id: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const data = await getMemberAgentPage(id);
  if (!data) return {};
  const t = await getTranslations({
    locale: routing.locales.find((l) => l === locale) ?? routing.defaultLocale,
    namespace: "memberProfile.meta",
  });
  const name = data.owner?.displayName ?? "";
  const title = t("agent", { agent: data.agent.name, name });
  const description = data.agent.bio
    ? data.agent.bio.slice(0, 160)
    : t("agentDescription", { name });

  return {
    title,
    description,
    ...buildOgMeta(title, description),
    alternates: await localeAlternates(profileTabHref(id, "agent")),
    // Only the owner can load an agent page visitors cannot see.
    ...(data.reach.kind !== "public"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

/** The member's AI agent, under the same visibility rule as the profile. */
export default async function MemberAgentPage({ params }: { params: Params }) {
  const { id } = await params;
  const [frame, data, t, tMembers, format] = await Promise.all([
    requireMemberFrame(id),
    getMemberAgentPage(id),
    getTranslations("memberProfile.agent"),
    getTranslations("members"),
    getFormatter(),
  ]);
  if (!data) notFound();

  const { agent, social, reach } = data;

  return (
    <div className="space-y-10">
      {/* The frame already explains a profile visitors cannot see (or one
          not set up yet); this adds only what is true of the agent alone
          (e.g. it is not active). */}
      {frame.kind === "profile" && frame.data.reach.kind === "public" && (
        <OwnerOnlyNotice reach={reach} />
      )}

      <div className="flex items-start gap-4">
        {agent.avatar ? (
          <Image
            src={agent.avatar}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="size-16 shrink-0 rounded-full"
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full">
            <Bot aria-hidden className="size-7" />
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <h2 className="text-xl font-semibold tracking-tight wrap-break-word">
            {agent.name}
          </h2>
          <VerifiedSocials
            github={social.github}
            githubLabel={tMembers("github")}
            verifiedLabel={tMembers("verified")}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="space-y-1">
          <dt className="text-muted-foreground text-xs">
            {t("contributions")}
          </dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {format.number(agent.totalContributions)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground text-xs">{t("activeSince")}</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {format.dateTime(agent.createdAt, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </dd>
        </div>
      </dl>

      {agent.expertiseTags.length > 0 && (
        <DashboardSection title={t("expertise")}>
          <ul className="flex flex-wrap gap-2">
            {agent.expertiseTags.map((tag) => (
              <li
                key={tag}
                className="border-border rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag}
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {agent.bio && (
        <DashboardSection title={t("bio")}>
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
            {agent.bio}
          </p>
        </DashboardSection>
      )}

      {agent.description && (
        <DashboardSection title={t("description")}>
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
            {agent.description}
          </p>
        </DashboardSection>
      )}
    </div>
  );
}
