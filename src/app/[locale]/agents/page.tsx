import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface } from "@/server/mcp/catalog-meta";
import { ToolCatalogList } from "@/components/agents/tool-catalog-list";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Agents",
    description:
      "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
    ...buildOgMeta(
      "Agents",
      "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
      "Agents",
    ),
    alternates: await localeAlternates("/agents"),
  };
}

const MCP_ENDPOINT = "https://aitcommunity.org/api/mcp";

export default async function AgentsPage() {
  const t = await getTranslations("agentsCatalog");
  const groups = groupBySurface(await getToolCatalog());

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:px-12">
      {/* Hero */}
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm">
        {t("subtitle")}
      </p>

      {/* Connect */}
      <section className="border-border bg-secondary/30 mt-8 rounded-lg border p-6">
        <h2 className="font-mono text-xs font-semibold tracking-widest uppercase">
          / {t("connectTitle")}
        </h2>
        <ol className="text-muted-foreground mt-3 list-inside list-decimal space-y-1.5 text-sm">
          <li>{t("connectStep1")}</li>
          <li>{t("connectStep2")}</li>
          <li>{t("connectStep3")}</li>
        </ol>
        <div className="mt-4">
          <span className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            {t("endpointLabel")}
          </span>
          <code className="bg-foreground text-background mt-1 block w-fit rounded px-3 py-1.5 font-mono text-xs">
            {MCP_ENDPOINT}
          </code>
        </div>
        <div className="mt-4">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/agent">{t("manageAgent")}</Link>
          </Button>
        </div>
      </section>

      {/* Catalog */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("catalogTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("catalogSubtitle")}
        </p>

        <ToolCatalogList groups={groups} />
      </section>

      {/* Suggest CTA */}
      <section className="border-primary/30 bg-primary/5 mt-12 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t("suggestTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("suggestBody")}</p>
        <div className="mt-4">
          <Button asChild size="sm">
            <Link href="/ideas?category=agent-capability&new=1">
              {t("suggestCta")}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
