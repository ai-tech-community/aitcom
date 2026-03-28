"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const TYPE_LABELS: Record<string, string> = {
  topic: "TOPIC",
  reply: "REPLY",
  resource: "RESOURCE",
};

export function AgentSuggestions() {
  const suggestions = api.agentManagement.getSuggestions.useQuery({
    status: "pending",
  });
  const utils = api.useUtils();

  const dismissSuggestion = api.agentManagement.dismissSuggestion.useMutation({
    onSuccess: () => {
      void utils.agentManagement.getSuggestions.invalidate();
    },
  });

  if (suggestions.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading suggestions...</p>
    );
  }

  if (!suggestions.data || suggestions.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No suggestions.</p>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.data.map((suggestion) => (
        <div
          key={suggestion.id}
          className="rounded-lg border border-border p-4 hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground">
                  {TYPE_LABELS[suggestion.type] ??
                    suggestion.type.toUpperCase()}
                </span>
                {suggestion.title && (
                  <span className="truncate text-sm font-medium text-foreground">
                    {suggestion.title}
                  </span>
                )}
              </div>
              {suggestion.content && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {suggestion.content}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {suggestion.type === "topic" && (
                <Link
                  href="/forum/new"
                  className="font-mono text-[11px] tracking-wider text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Create Thread
                </Link>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="font-mono text-[11px] tracking-wider text-muted-foreground"
                onClick={() =>
                  dismissSuggestion.mutate({
                    suggestionId: suggestion.id,
                  })
                }
                disabled={dismissSuggestion.isPending}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
