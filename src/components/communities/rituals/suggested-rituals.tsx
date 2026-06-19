"use client";

import { api } from "@/trpc/react";
import { weekdayLabel } from "@/server/communities/rituals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function SuggestedRituals({ slug }: { slug: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.rituals.pendingSuggestions.useQuery({ slug });

  const invalidate = () => {
    void utils.rituals.pendingSuggestions.invalidate({ slug });
    void utils.rituals.list.invalidate({ slug });
  };

  const review = api.rituals.reviewSuggestion.useMutation({
    onSuccess: invalidate,
  });

  if (isLoading || !data || data.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Suggested by your agent</h3>
        <p className="text-muted-foreground text-xs">
          Rituals your agent proposed, waiting for your review.
        </p>
        {review.error ? (
          <p className="text-destructive mt-2 text-sm">
            {review.error.message || "Could not review. Try again."}
          </p>
        ) : null}
      </div>
      <div className="divide-y">
        {data.map((s) => (
          <div
            key={s.draftId}
            className="flex items-start justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.title}</p>
              <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                <span>{weekdayLabel(s.weekday)}</span>
                <Badge variant="outline" className="text-xs">
                  {s.mode === "auto" ? "Auto" : "Review"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                {s.body}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() =>
                  review.mutate({
                    slug,
                    draftId: s.draftId,
                    action: "approved",
                  })
                }
                disabled={
                  review.isPending && review.variables?.draftId === s.draftId
                }
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() =>
                  review.mutate({
                    slug,
                    draftId: s.draftId,
                    action: "rejected",
                  })
                }
                disabled={
                  review.isPending && review.variables?.draftId === s.draftId
                }
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
