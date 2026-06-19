"use client";

import { Badge } from "@/components/ui/badge";

// Role is a categorical attribute (not a status), so it uses a neutral
// secondary Badge whose label carries the meaning — per DESIGN.md.
export function RoleBadge({ role }: { role?: string | null }) {
  if (!role || role === "member") return null;
  return (
    <Badge
      variant="secondary"
      className="px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase"
    >
      {role}
    </Badge>
  );
}
