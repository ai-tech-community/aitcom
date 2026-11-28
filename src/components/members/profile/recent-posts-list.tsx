import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ProfilePost } from "@/server/members/profile-posts";

export async function RecentPostsList({
  posts,
  followsWork,
}: {
  posts: readonly ProfilePost[];
  followsWork: boolean;
}) {
  const [t, format] = await Promise.all([
    getTranslations("redesign.members"),
    getFormatter(),
  ]);
  return (
    <div className={cn(followsWork && "border-border border-t pt-3")}>
      <h3 className="text-sm font-semibold">{t("recentPosts")}</h3>
      <ul className="divide-border divide-y">
        {posts.map((post) => (
          <li key={post.id} className="py-2">
            <p
              dir="auto"
              className="line-clamp-2 text-sm wrap-break-word whitespace-pre-line"
            >
              {post.content.trim().replace(/\s*\n\s*/g, "\n") || t("feedPost")}
            </p>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
              <Link
                href={`/communities/${post.community.slug}`}
                className="inline-flex min-h-11 items-center rounded-sm font-medium underline-offset-4 hover:underline sm:min-h-8"
              >
                {post.community.name}
              </Link>
              <time dateTime={post.createdAt} className="font-mono">
                {format.dateTime(new Date(post.createdAt), {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
