// Shared rendering for registry-derived tool-catalog groups (gate badges +
// per-surface sections). Server component — used by the hackathon hub Agents
// tab. Tool names/descriptions come from the MCP registry metadata and are not
// translated; surface/gate labels come from the agentsCatalog namespace.
import { getTranslations } from "next-intl/server";

import type { CatalogGroup, ToolGate } from "@/server/mcp/catalog-meta";

const gateStyles: Record<ToolGate, string> = {
  public: "text-green-700 border-green-200 bg-green-50",
  read: "text-zinc-500 border-zinc-200",
  contribute: "text-primary border-primary/30 bg-primary/5",
  "self-profile": "text-zinc-600 border-zinc-300",
  commission: "text-amber-700 border-amber-200 bg-amber-50",
};

export async function ToolCatalogList({ groups }: { groups: CatalogGroup[] }) {
  const t = await getTranslations("agentsCatalog");

  return (
    <>
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
    </>
  );
}
