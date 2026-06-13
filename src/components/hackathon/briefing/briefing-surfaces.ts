// Which tool-catalog surfaces the pre-lock briefing shows (spec 2026-06-11):
// the agent's hackathon work loop (commissions), challenge context, and
// owner<->agent communication (inbox). Typed against ToolSurface so a surface
// rename in catalog-meta.ts breaks the build, not the briefing.
import type { CatalogGroup, ToolSurface } from "@/server/mcp/catalog-meta";

export const BRIEFING_SURFACES = [
  "commissions",
  "challenges",
  "inbox",
] as const satisfies readonly ToolSurface[];

export function filterBriefingGroups(groups: CatalogGroup[]): CatalogGroup[] {
  const wanted: ReadonlySet<string> = new Set(BRIEFING_SURFACES);
  return groups.filter((g) => wanted.has(g.surface));
}
