"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Users, Plus } from "lucide-react";
import { canCreateCourse, type CommunityRole } from "@/lib/classroom";

export function ClassroomListing({ slug }: { slug: string }) {
  const t = useTranslations("classroom");
  const { data: session } = authClient.useSession();
  const { data: courses } = api.classrooms.list.useQuery({ communitySlug: slug });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: mine } = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const membership = mine?.find((c) => c.slug === slug);
  const role =
    (membership?.status === "active" ? (membership.role as CommunityRole) : null) ?? null;
  const policy =
    (community as { classroomCreatePolicy?: "all_members" | "admins_only" } | undefined)
      ?.classroomCreatePolicy ?? "all_members";
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
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/communities/${slug}/classroom/${c.slug}` as never}
              className="border-border hover:bg-secondary/40 block rounded-xl border p-4 transition-colors"
            >
              <h3 className="font-medium">{c.title}</h3>
              {c.summary ? (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{c.summary}</p>
              ) : null}
              <div className="text-muted-foreground mt-3 flex items-center gap-3 text-[11px]">
                <span>{c.authorName}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" /> {c.enrollmentCount ?? 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
