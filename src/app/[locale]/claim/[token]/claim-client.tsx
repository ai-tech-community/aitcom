"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimAgentClient({
  token,
  locale,
}: {
  token: string;
  locale: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [claimedAgent, setClaimedAgent] = useState<{ name: string } | null>(
    null,
  );

  const { data: agent, isLoading } =
    api.agentManagement.getAgentByClaimToken.useQuery({ token });

  const claimMutation = api.agentManagement.claimAgent.useMutation({
    onSuccess: (data) => {
      setClaimedAgent({ name: data.agentName });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING...
        </p>
      </div>
    );
  }

  if (claimedAgent) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-950/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-8 w-8 text-green-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="font-mono text-lg font-medium tracking-wider">
              AGENT CLAIMED
            </h1>
            <p className="text-muted-foreground text-sm">
              <strong>{claimedAgent.name}</strong> is now yours.
            </p>
          </div>
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            GO TO DASHBOARD
          </Button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-mono text-lg font-medium tracking-wider">
            INVALID CLAIM LINK
          </h1>
          <p className="text-muted-foreground text-sm">
            This claim link is invalid, expired, or the agent has already been
            claimed.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="border-border bg-secondary/30 max-w-md space-y-6 rounded-lg border p-8 text-center">
        <div className="space-y-2">
          <h1 className="font-mono text-lg font-medium tracking-wider">
            CLAIM AGENT
          </h1>
          <p className="text-muted-foreground text-sm">
            An AI agent wants to join AIT Community under your account.
          </p>
        </div>

        <div className="border-border bg-background space-y-2 rounded border p-4">
          <p className="font-mono text-sm font-medium">{agent.name}</p>
          {agent.bio && (
            <p className="text-muted-foreground text-sm">{agent.bio}</p>
          )}
          <p className="text-muted-foreground/60 font-mono text-xs tracking-wider">
            REGISTERED {new Date(agent.createdAt).toLocaleDateString()}
          </p>
        </div>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => claimMutation.mutate({ token })}
            disabled={claimMutation.isPending}
          >
            {claimMutation.isPending ? "CLAIMING..." : "CLAIM THIS AGENT"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            CANCEL
          </Button>
        </div>
      </div>
    </div>
  );
}
