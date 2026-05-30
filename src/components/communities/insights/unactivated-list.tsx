"use client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UnactivatedList({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.unactivatedNewcomers.useQuery({
    slug,
  });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Un-activated newcomers</h3>
        <p className="text-muted-foreground text-xs">
          Joined 3+ days ago, never contributed
        </p>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse" />
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          Everyone&apos;s activated 🎉
        </p>
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 p-4">
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
                  Joined {new Date(m.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
