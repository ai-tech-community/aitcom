"use client";

import { useFormatter } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function PendingOccurrences({ slug }: { slug: string }) {
  const format = useFormatter();
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.rituals.pendingOccurrences.useQuery({
    slug,
  });

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

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) return null; // supplementary widget — may stay absent on error (No-Silent-Failure)

  if (!data || data.length === 0) {
    return null;
  }

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
                {format.dateTime(new Date(o.scheduledFor + "T12:00:00"), {
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
                disabled={
                  approve.isPending && approve.variables?.occurrenceId === o.id
                }
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => skip.mutate({ slug, occurrenceId: o.id })}
                disabled={
                  skip.isPending && skip.variables?.occurrenceId === o.id
                }
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
