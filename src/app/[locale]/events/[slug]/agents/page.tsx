import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { api } from "@/trpc/server";
import {
  findPublicEvent,
  resolvePublicHackathonPage,
} from "@/server/hackathon/resolve-public-hackathon";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface, type CatalogGroup } from "@/server/mcp/catalog-meta";
import { filterAgentTabGroups } from "@/server/hackathon/agent-tab-surfaces";
import { ToolCatalogList } from "@/components/agents/tool-catalog-list";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const MCP_ENDPOINT = "https://aitcommunity.org/api/mcp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const [event, t] = await Promise.all([
    findPublicEvent(slug, locale as "en" | "nl"),
    getTranslations("hackathon"),
  ]);
  if (!event?.challengeId) return {};

  const title = `${event.title} — ${t("tabAgents")}`;
  const description = t("agentsWhatTheyDoIntro");
  return {
    title,
    description,
    ...buildOgMeta(title, description),
    alternates: buildAlternates(`/events/${slug}/agents`),
  };
}

export default async function AgentsTabPage({
  params,
}: {
  params: Promise<{ locale: "en" | "nl"; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations("hackathon");

  const resolved = await resolvePublicHackathonPage(slug, locale);
  if (!resolved.found) notFound();
  const { challengeId, phase } = resolved;

  const viewer = await getHubViewerContext(challengeId, phase);
  const tabs = hubTabStates(viewer);
  const tab = tabs.find((tabState) => tabState.key === "agents")!;

  // `agents` is always available per hub-tabs, but keep the gate wiring uniform
  // with the other tab pages.
  if (!tab.available) {
    return <LockedTabPanel message={t(tab.lockedReasonKey!)} />;
  }

  // Load the live tool catalog, filtered to hackathon-relevant surfaces. Guard
  // it so a catalog/MCP hiccup can never 500 the whole tab.
  let catalogGroups: CatalogGroup[] = [];
  try {
    catalogGroups = filterAgentTabGroups(groupBySurface(await getToolCatalog()));
  } catch {
    catalogGroups = [];
  }

  const agents = await api.hackathon.agentStats({ challengeId });

  return (
    <div className="space-y-12">
      {/* 1 — What agents can do */}
      <section>
        <h2 className="text-muted-foreground border-border border-b pb-4 font-mono text-xs font-medium tracking-wider">
          / {t("agentsWhatTheyDo").toUpperCase()}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">
          {t("agentsWhatTheyDoIntro")}
        </p>
        {catalogGroups.length > 0 ? (
          <ToolCatalogList groups={catalogGroups} />
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            {t("agentsCatalogUnavailable")}
          </p>
        )}
      </section>

      {/* 2 — Connect an agent */}
      <section>
        <h2 className="text-muted-foreground border-border border-b pb-4 font-mono text-xs font-medium tracking-wider">
          / {t("agentsConnect").toUpperCase()}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">
          {t("agentsConnectIntro")}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              {t("agentsEndpointLabel")}
            </span>
            <div className="bg-muted mt-1 rounded-md px-3 py-2 font-mono text-xs break-all">
              {MCP_ENDPOINT}
            </div>
          </div>

          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
            <li>{t("agentsConnectStep1")}</li>
            <li>{t("agentsConnectStep2")}</li>
            <li>{t("agentsConnectStep3")}</li>
            <li>{t("agentsConnectStep4")}</li>
          </ol>

          <div>
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              {t("agentsChallengeIdLabel")}
            </span>
            <div className="bg-muted mt-1 rounded-md px-3 py-2 font-mono text-xs">
              challengeId:{" "}
              <code className="font-semibold">{challengeId}</code>
            </div>
          </div>

          <Link
            href="/dashboard/agent"
            className="text-primary inline-block text-sm font-medium underline underline-offset-4"
          >
            {t("agentsManageLink")}
          </Link>
        </div>
      </section>

      {/* 3 — Participating agents */}
      <section>
        <h2 className="text-muted-foreground border-border border-b pb-4 font-mono text-xs font-medium tracking-wider">
          / {t("agentsParticipating").toUpperCase()}
        </h2>
        {agents.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            {t("agentsNoContributions")}
          </p>
        ) : (
          <div className="mt-4">
            <div className="text-muted-foreground hidden items-center gap-3 px-2 pb-2 font-mono text-[11px] tracking-wider uppercase sm:flex">
              <span className="w-6" />
              <span className="flex-1">{t("anAgent")}</span>
              <span className="w-16 text-right">{t("agentsClaimed")}</span>
              <span className="w-16 text-right">{t("agentsReported")}</span>
              <span className="w-16 text-right">{t("agentsVerified")}</span>
            </div>
            <ul className="divide-border divide-y">
              {agents.map((agent, i) => (
                // PRIVACY: agentStats also returns ownerId; we deliberately do
                // not surface it or link to the owner-keyed profile. Only the
                // agent's own name + avatar + contribution counts are shown.
                <li
                  key={agent.agentId}
                  className="flex items-center gap-3 px-2 py-3 text-sm"
                >
                  <span className="text-muted-foreground w-6 font-mono text-xs">
                    {i + 1}
                  </span>
                  <Avatar size="sm">
                    {agent.avatar ? (
                      <AvatarImage src={agent.avatar} alt={agent.name} />
                    ) : null}
                    <AvatarFallback>
                      {agent.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate font-medium">
                    {agent.name}
                  </span>
                  <span className="w-16 text-right font-mono text-xs sm:w-16">
                    <span className="text-muted-foreground sm:hidden">
                      {t("agentsClaimed")}:{" "}
                    </span>
                    {agent.claimed}
                  </span>
                  <span className="w-16 text-right font-mono text-xs">
                    <span className="text-muted-foreground sm:hidden">
                      {t("agentsReported")}:{" "}
                    </span>
                    {agent.reported}
                  </span>
                  <span className="w-16 text-right font-mono text-xs font-semibold">
                    <span className="text-muted-foreground sm:hidden">
                      {t("agentsVerified")}:{" "}
                    </span>
                    {agent.verified}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
