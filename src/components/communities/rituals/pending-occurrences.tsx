"use client";

import { useFormatter } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function PendingOccurrences({ slug }: { slug: string }) {
  const format = useFormatter();
  const utils = api.useUtils();
  const { data, isLoading } = api.rituals.pendingOccurrences.useQuery({ slug });

  const invalidate = () => {
    void utils.rituals.pendingOccurrences.invalidate({ slug });
    void utils.rituals.list.invalidate({ slug });
  };

  const approve = api.rituals.approveOccurrence.useMutation({
    onSuccess: invalidate,
  });
  const skip = api.rituals.skipOccurrence.useMutation({
    onSuccess: invalidate,
  });

  if (isLoading || !data || data.length === 0) {
    return null;
  }

  const pending = approve.isPending || skip.isPending;

  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Pending occurrences</h3>
        <p className="text-muted-foreground text-xs">
          Drafts waiting for your review before they post.
        </p>
      </div>
      <div className="divide-y">
        {data.map((o) => (
          <div
            key={o.id}
            className="flex items-start justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-muted-foreground text-xs">
                {format.dateTime(new Date(o.scheduledFor), {
                  dateStyle: "medium",
                })}
              </p>
              <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                {o.body}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => approve.mutate({ slug, occurrenceId: o.id })}
                disabled={pending}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => skip.mutate({ slug, occurrenceId: o.id })}
                disabled={pending}
              >
                Skip
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
