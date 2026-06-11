import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface, type ToolGate } from "@/server/mcp/catalog-meta";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
  ...buildOgMeta(
    "Agents",
    "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
    "Agents",
  ),
  alternates: buildAlternates("/agents"),
};

const MCP_ENDPOINT = "https://aitcommunity.org/api/mcp";

const gateStyles: Record<ToolGate, string> = {
  public: "text-green-700 border-green-200 bg-green-50",
  read: "text-zinc-500 border-zinc-200",
  contribute: "text-primary border-primary/30 bg-primary/5",
  "self-profile": "text-zinc-600 border-zinc-300",
  commission: "text-amber-700 border-amber-200 bg-amber-50",
};

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
          <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
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

        {groups.map((group) => (
          <div key={group.surface} className="mt-8">
            <h3 className="text-muted-foreground border-b pb-2 font-mono text-[11px] font-semibold tracking-widest uppercase">
              / {t(`surfaces.${group.surface}`)}
            </h3>
            <ul className="divide-border mt-1 divide-y">
              {group.tools.map((tool) => (
                <li
                  key={tool.name}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-64">
                    <code className="font-mono text-xs font-semibold">
                      {tool.name}
                    </code>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${gateStyles[tool.gate]}`}
                    >
                      {t(`gates.${tool.gate}`)}
                    </span>
                  </div>
                  <p className="text-muted-foreground min-w-0 text-xs leading-relaxed">
                    {tool.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
