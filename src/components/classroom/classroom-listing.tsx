"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Users, Plus, BookOpen } from "lucide-react";
import { canCreateCourse, type CommunityRole } from "@/lib/classroom";

export function ClassroomListing({ slug }: { slug: string }) {
  const t = useTranslations("classroom");
  const { data: session } = authClient.useSession();
  const { data: courses } = api.classrooms.list.useQuery({
    communitySlug: slug,
  });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: mine } = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const membership = mine?.find((c) => c.slug === slug);
  const role =
    (membership?.status === "active"
      ? (membership.role as CommunityRole)
      : null) ?? null;
  const policy =
    (
      community as
        | { classroomCreatePolicy?: "all_members" | "admins_only" }
        | undefined
    )?.classroomCreatePolicy ?? "all_members";
  const mayCreate = canCreateCourse(policy, role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        {mayCreate ? (
          <Button asChild>
            <Link href={`/communities/${slug}/classroom/new` as never}>
              <Plus className="mr-1.5 size-4" /> {t("createCourse")}
            </Link>
          </Button>
        ) : null}
      </div>

      {!courses || courses.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center font-mono text-xs tracking-wider">
          {t("noCourses")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const progress = c.progressPercent ?? 0;
            return (
              <Link
                key={c.id}
                href={`/communities/${slug}/classroom/${c.slug}` as never}
                className="border-border hover:bg-secondary/40 group flex flex-col overflow-hidden rounded-xl border transition-colors"
              >
                {c.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.coverImageUrl}
                    alt={c.title}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center">
                    <BookOpen className="size-8 opacity-40" />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{c.title}</h3>
                    {c.status !== "published" ? (
                      <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs tracking-wider uppercase">
                        {c.status === "draft" ? t("draft") : t("archivedBadge")}
                      </span>
                    ) : null}
                  </div>
                  {c.summary ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {c.summary}
                    </p>
                  ) : null}
                  <div className="text-muted-foreground mt-3 flex items-center gap-3 text-xs">
                    <span>{c.authorName}</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {c.enrollmentCount ?? 0}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="bg-muted h-1.5 flex-1 rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground font-mono text-xs">
                      {progress}%
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
