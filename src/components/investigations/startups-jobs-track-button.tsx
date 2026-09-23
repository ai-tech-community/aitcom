"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

export function StartupsJobsTrackButton({
  roleId,
  tracked,
  trackLabel,
  trackingLabel,
}: {
  roleId: string;
  tracked: boolean;
  trackLabel: string;
  trackingLabel: string;
}) {
  const [on, setOn] = useState(tracked);
  const utils = api.useUtils();
  const setApplying = api.startups.setMyRoleApplication.useMutation({
    onSuccess: async () => {
      await utils.startups.getMyRoleApplication.invalidate({ roleId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={on}
      aria-label={on ? trackingLabel : trackLabel}
      title={on ? trackingLabel : trackLabel}
      data-startup-track=""
      disabled={setApplying.isPending}
      onClick={() => {
        const next = !on;
        setOn(next);
        setApplying.mutate(
          { roleId, applying: next },
          { onError: () => setOn(!next) },
        );
      }}
    >
      <Bookmark
        aria-hidden="true"
        className={on ? "fill-current" : undefined}
      />
    </Button>
  );
}
