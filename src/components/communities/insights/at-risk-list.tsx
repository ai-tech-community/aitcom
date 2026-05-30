"use client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function AtRiskList({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.atRiskMembers.useQuery({ slug });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">At-risk members</h3>
        <p className="text-muted-foreground text-xs">
          Active before, silent the last 14 days
        </p>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse" />
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          No at-risk members 🎉
        </p>
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  {m.image ? (
                    <AvatarImage src={m.image} alt={m.displayName ?? ""} />
                  ) : null}
                  <AvatarFallback>
                    {(m.displayName ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {m.displayName ?? "Member"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {m.priorContributions} prior contribution
                    {m.priorContributions === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {m.role}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
