"use client";

import { useState } from "react";
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
      variant="outline"
      size="sm"
      aria-pressed={on}
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
      {on ? trackingLabel : trackLabel}
    </Button>
  );
}
