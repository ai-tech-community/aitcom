"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { weekdayLabel } from "@/server/communities/rituals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RitualForm } from "./ritual-form";
import { PendingOccurrences } from "./pending-occurrences";
import { DigestRecallSettings } from "@/components/communities/engage/digest-recall-settings";

export function RitualsManager({ slug }: { slug: string }) {
  const [showForm, setShowForm] = useState(false);
  const utils = api.useUtils();
  const { data, isLoading, error } = api.rituals.list.useQuery({ slug });

  const setStatus = api.rituals.setStatus.useMutation({
    onSuccess: () => {
      void utils.rituals.list.invalidate({ slug });
    },
  });

  // Non-managers shouldn't see this surface at all.
  if (error?.data?.code === "FORBIDDEN") {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        You don&apos;t manage this community.
      </p>
    );
  }

  if (error) {
    return <p className="text-destructive py-4 text-sm">{error.message}</p>;
  }

  return (
    <div className="space-y-8 py-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Rituals</h2>
            <p className="text-muted-foreground text-sm">
              Recurring prompts that post on a weekly cadence.
            </p>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              Add ritual
            </Button>
          )}
        </div>

        {showForm && (
          <RitualForm slug={slug} onDone={() => setShowForm(false)} />
        )}

        <div className="rounded-lg border">
          {isLoading ? (
            <div
              role="status"
              aria-label="Loading rituals"
              className="h-24 animate-pulse"
            />
          ) : !data || data.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              No rituals yet. Add one to get started.
            </p>
          ) : (
            <div className="divide-y">
              {data.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <span>{weekdayLabel(r.weekday)}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.mode === "auto" ? "Auto" : "Review"}
                      </Badge>
                      <Badge
                        variant={
                          r.status === "active" ? "secondary" : "outline"
                        }
                        className="text-[10px] capitalize"
                      >
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      setStatus.mutate({
                        slug,
                        ritualId: r.id,
                        status: r.status === "active" ? "paused" : "active",
                      })
                    }
                    disabled={
                      setStatus.isPending &&
                      setStatus.variables?.ritualId === r.id
                    }
                  >
                    {r.status === "active" ? "Pause" : "Resume"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PendingOccurrences slug={slug} />

      <DigestRecallSettings slug={slug} />
    </div>
  );
}
