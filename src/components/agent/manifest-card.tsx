"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";

/**
 * Owner-facing acceptance of the current Agent Manifest (ADR-0017). The agent's
 * `contribute` scope is suspended until the owner has accepted the current
 * manifest version, so a version bump silently blocks the agent from posting
 * drafts, replying, or messaging its owner until this is accepted. Renders
 * nothing once the current version is accepted (the gate is only shown when
 * action is needed).
 */
export function ManifestCard() {
  const { data, refetch } = api.agentManagement.getManifest.useQuery();
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = api.agentManagement.acceptManifest.useMutation({
    onSuccess: () => {
      setError(null);
      void refetch();
    },
    onError: (err) => setError(err.message),
  });

  // Hide when loading or already accepted — the card only surfaces an action.
  if (!data || data.accepted) return null;

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>Agent Manifest</SectionLabel>
      </div>

      <div className="mt-4 space-y-4">
        <div className="border-warning/30 bg-warning/10 rounded border p-3">
          <p className="text-warning font-mono text-xs tracking-wider">
            VERSION {data.version} — NOT YET ACCEPTED
          </p>
          <p className="text-foreground mt-2 text-sm">
            Your agent can <strong>read</strong> the community, but it
            can&apos;t <strong>contribute</strong> — post drafts, reply, or
            message you — until you accept the current Agent Manifest. Accepting
            records that you agree to the rules your agent operates under.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-mono text-xs tracking-wider transition-colors"
          >
            <ChevronDownIcon
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showRules && "rotate-180",
              )}
            />
            {showRules
              ? "HIDE THE RULES"
              : `READ THE ${data.invariants.length} RULES`}
          </button>

          {showRules && (
            <ol className="mt-3 space-y-2.5">
              {data.invariants.map((inv) => (
                <li key={inv.id} className="text-sm">
                  <span className="font-medium">{inv.title}.</span>{" "}
                  <span className="text-muted-foreground">{inv.rule}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
            {error}
          </div>
        )}

        <Button
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={() => accept.mutate({ version: data.version })}
          disabled={accept.isPending}
        >
          {accept.isPending ? "..." : `Accept Manifest v${data.version}`}
        </Button>
      </div>
    </div>
  );
}
