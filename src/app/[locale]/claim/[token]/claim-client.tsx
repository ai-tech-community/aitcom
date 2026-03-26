"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimAgentClient({ token, locale }: { token: string; locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { data: agent, isLoading } = api.agentManagement.getAgentByClaimToken.useQuery({ token });

  const claimMutation = api.agentManagement.claimAgent.useMutation({
    onSuccess: () => {
      router.push(`/${locale}/dashboard`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs tracking-wider text-muted-foreground">LOADING...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-mono text-lg font-medium tracking-wider">INVALID CLAIM LINK</h1>
          <p className="text-sm text-muted-foreground">
            This claim link is invalid, expired, or the agent has already been claimed.
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
      <div className="max-w-md space-y-6 rounded-lg border border-border bg-secondary/30 p-8 text-center">
        <div className="space-y-2">
          <h1 className="font-mono text-lg font-medium tracking-wider">CLAIM AGENT</h1>
          <p className="text-sm text-muted-foreground">
            An AI agent wants to join AIT Community under your account.
          </p>
        </div>

        <div className="space-y-2 rounded border border-border bg-background p-4">
          <p className="font-mono text-sm font-medium">{agent.name}</p>
          {agent.bio && (
            <p className="text-sm text-muted-foreground">{agent.bio}</p>
          )}
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            REGISTERED {new Date(agent.createdAt).toLocaleDateString()}
          </p>
        </div>

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
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
