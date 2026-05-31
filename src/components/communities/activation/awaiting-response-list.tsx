"use client";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const DAY_MS = 24 * 60 * 60 * 1000;

type QueueItem = {
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  contributionAt: string | Date;
  displayName: string | null;
  image: string | null;
};

/** Build the "reply in thread" href for a queue item, or null if we can't
 *  resolve a destination (then the link is omitted gracefully). */
function replyHref(slug: string, item: QueueItem): string | null {
  if (item.action === "thread.create") {
    const meta = item.metadata ?? {};
    const threadSlug =
      (typeof meta.slug === "string" && meta.slug) ||
      (typeof meta.threadSlug === "string" && meta.threadSlug) ||
      item.targetId;
    if (!threadSlug) return null;
    return `/communities/${slug}/forum/${threadSlug}`;
  }
  // feed.post_created has no community-scoped permalink today — omit the link.
  return null;
}

export function AwaitingResponseList({ slug }: { slug: string }) {
  const { data, isLoading, error } = api.activation.awaitingResponse.useQuery({
    slug,
  });

  if (
    (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN"
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Awaiting a first response</h3>
        <p className="text-muted-foreground text-xs">
          Newcomers whose first post has no reply yet — say hi.
        </p>
      </div>
      {isLoading ? (
        <div
          role="status"
          aria-label="Loading"
          className="h-24 animate-pulse"
        />
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          No newcomers awaiting a response
        </p>
      ) : (
        <div className="divide-y">
          {data.map((item) => {
            const days = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(item.contributionAt).getTime()) / DAY_MS,
              ),
            );
            const href = replyHref(slug, item as QueueItem);
            return (
              <div
                key={item.userId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    {item.image ? (
                      <AvatarImage
                        src={item.image}
                        alt={item.displayName ?? ""}
                      />
                    ) : null}
                    <AvatarFallback>
                      {(item.displayName ?? "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {item.displayName ?? "Member"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      posted {days} {days === 1 ? "day" : "days"} ago, no reply
                      yet
                    </p>
                  </div>
                </div>
                {href ? (
                  <Link
                    href={href as never}
                    className="text-primary text-sm font-medium hover:underline sm:shrink-0"
                  >
                    Reply in thread
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
