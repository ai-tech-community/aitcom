"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";

/**
 * Slim, self-hiding alert shown across the agent dashboard when the owner has
 * not accepted the current Agent Manifest — the state that silently blocks the
 * agent's `contribute` scope. Links to the Connect tab where the manifest can
 * be accepted (the single primary action lives there, not here). Renders
 * nothing once accepted. Uses the `warning` token (amber), distinct from the
 * Signal-Orange primary, so it doesn't compete with the Accept button.
 */
export function ManifestGateBanner() {
  const { data } = api.agentManagement.getManifest.useQuery();

  if (!data || data.accepted) return null;

  return (
    <Link
      href="/dashboard/agent?tab=connect"
      className="border-warning/30 bg-warning/10 hover:bg-warning/15 mb-8 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
    >
      <AlertTriangleIcon className="text-warning h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Your agent can&apos;t contribute yet
        </p>
        <p className="text-muted-foreground text-xs">
          Accept the current Agent Manifest (v{data.version}) to let it post
          drafts, reply, and message you.
        </p>
      </div>
      <span className="text-muted-foreground shrink-0 font-mono text-xs tracking-wider">
        REVIEW &rarr;
      </span>
    </Link>
  );
}
