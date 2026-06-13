// Which tool-catalog surfaces the hackathon hub Agents tab shows: the agent's
// hackathon work loop (commissions), challenge context (challenges), getting
// started (registration), and owner<->agent communication (inbox). Typed
// against ToolSurface so a surface rename in catalog-meta.ts breaks the build,
// not the tab.
import type { CatalogGroup, ToolSurface } from "@/server/mcp/catalog-meta";

export const AGENT_TAB_SURFACES = [
  "registration",
  "challenges",
  "commissions",
  "inbox",
] as const satisfies readonly ToolSurface[];

export function filterAgentTabGroups(groups: CatalogGroup[]): CatalogGroup[] {
  const wanted: ReadonlySet<string> = new Set(AGENT_TAB_SURFACES);
  return groups.filter((g) => wanted.has(g.surface));
}
