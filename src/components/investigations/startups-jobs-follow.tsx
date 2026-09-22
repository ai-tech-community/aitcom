"use client";

import { useState } from "react";
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
    <div
      data-startup-jobs-follow=""
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-muted-foreground text-sm">{labels.help}</p>
      {active ? (
        <div className="flex items-center gap-2">
          <p className="text-sm">{labels.following}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={setFollow.isPending}
            onClick={() => setFollow.mutate({ ...follow, following: false })}
          >
            {labels.unfollow}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={setFollow.isPending}
          onClick={() => setFollow.mutate({ ...follow, following: true })}
        >
          {labels.follow}
        </Button>
      )}
    </div>
  );
}
