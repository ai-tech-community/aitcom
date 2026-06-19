"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PresenceStrip({ teamId }: { teamId: string }) {
  const t = useTranslations("hackathon");
  const { data } = api.teamWorkspace.presence.useQuery(
    { teamId },
    { refetchInterval: 5_000 },
  );

  const heartbeat = api.teamWorkspace.heartbeat.useMutation();
  // Keep the latest mutation in a ref so the interval effect depends only on teamId.
  const heartbeatRef = useRef(heartbeat);
  heartbeatRef.current = heartbeat;

  useEffect(() => {
    heartbeatRef.current.mutate({ teamId });
    const id = setInterval(
      () => heartbeatRef.current.mutate({ teamId }),
      20_000,
    );
    return () => clearInterval(id);
  }, [teamId]);

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground font-mono text-xs">
        {t("online")}
      </span>
      <TooltipProvider>
        <div className="flex items-center -space-x-2">
          {rows.map((row) => {
            const name = row.displayName ?? "Anonymous";
            return (
              <Tooltip key={row.userId}>
                <TooltipTrigger asChild>
                  <Avatar size="sm" className="ring-background ring-2">
                    <AvatarFallback>{getInitials(name)}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{name}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
