"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const TYPE_LABELS: Record<string, string> = {
  topic: "TOPIC",
  reply: "REPLY",
  resource: "RESOURCE",
  introduction: "INTRO",
};

export function AgentSuggestions() {
  const t = useTranslations("advisory");
  const suggestions = api.agentManagement.getSuggestions.useQuery({
    status: "pending",
  });
  const utils = api.useUtils();

  const dismissSuggestion = api.agentManagement.dismissSuggestion.useMutation({
    onSuccess: () => {
      void utils.agentManagement.getSuggestions.invalidate();
    },
  });

  const approveIntro = api.agentManagement.approveIntroduction.useMutation({
    onSuccess: () => {
      toast.success(t("introApproved"));
      void utils.agentManagement.getSuggestions.invalidate();
    },
  });

  if (suggestions.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Loading suggestions...</p>
    );
  }

  if (!suggestions.data || suggestions.data.length === 0) {
    return <p className="text-muted-foreground text-sm">No suggestions.</p>;
  }

  return (
    <div className="space-y-3">
      {suggestions.data.map((suggestion) => (
        <div
          key={suggestion.id}
          className="border-border hover:bg-secondary/50 rounded-lg border p-4 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                  {TYPE_LABELS[suggestion.type] ??
                    suggestion.type.toUpperCase()}
                </span>
                {suggestion.title && (
                  <span className="text-foreground truncate text-sm font-medium">
                    {suggestion.title}
                  </span>
                )}
              </div>
              {suggestion.content && (
                <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                  {suggestion.content}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {suggestion.type === "topic" && (
                <Link
                  href="/forum/new"
                  className="text-primary hover:text-primary/80 font-mono text-[11px] tracking-wider underline underline-offset-4"
                >
                  Create Thread
                </Link>
              )}
              {suggestion.type === "introduction" && (
                <Button
                  size="xs"
                  className="font-mono text-[11px] tracking-wider"
                  onClick={() =>
                    approveIntro.mutate({ suggestionId: suggestion.id })
                  }
                  disabled={approveIntro.isPending}
                >
                  {t("approve")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground font-mono text-[11px] tracking-wider"
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
