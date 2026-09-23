"use client";

import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { StartupJobsFollow } from "@/lib/investigations/startup-roles";
import { api } from "@/trpc/react";

export function StartupsJobsFollow({
  follow,
  following,
  labels,
}: {
  follow: StartupJobsFollow;
  following: boolean;
  labels: {
    follow: string;
    following: string;
    unfollow: string;
    help: string;
  };
}) {
  const [active, setActive] = useState(following);
  const setFollow = api.startups.setMyJobsFollow.useMutation({
    onSuccess: (data) => setActive(data.following),
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <span data-startup-jobs-follow="" className="inline-flex">
      <span id="jobs-follow-help" className="sr-only">
        {labels.help}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={active}
        aria-describedby="jobs-follow-help"
        title={active ? labels.unfollow : labels.help}
        disabled={setFollow.isPending}
        onClick={() => setFollow.mutate({ ...follow, following: !active })}
      >
        {active ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {active ? labels.following : labels.follow}
      </Button>
    </span>
  );
}
