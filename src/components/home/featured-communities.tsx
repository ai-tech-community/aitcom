"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";
import {
  pickFeaturedCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";

export function FeaturedCommunities({
  communities,
}: {
  communities: FeaturedCommunityCard[];
}) {
  const t = useTranslations("featuredCommunities");
  const items = pickFeaturedCommunities(communities);
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-12">
      <SectionLabel>{t("title")}</SectionLabel>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {items.map((community) => (
          <Link
            key={community.slug}
            href={`/communities/${community.slug}`}
            className="border-border hover:border-foreground/30 hover:bg-muted/40 flex h-full flex-col gap-3 rounded-xl border p-6 shadow-sm transition-colors"
          >
            <div className="flex items-center gap-3">
              {community.logoUrl ? (
                <Avatar size="default" className="size-9 rounded-md">
                  <AvatarImage src={community.logoUrl} alt="" />
                  <AvatarFallback>{getInitials(community.name)}</AvatarFallback>
                </Avatar>
              ) : (
                <SpaceAvatar name={community.name} />
              )}
              <span className="block min-w-0 flex-1 truncate text-sm font-semibold">
                {community.name}
              </span>
            </div>
            {community.description ? (
              <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                {community.description}
              </p>
            ) : null}
            <span className="text-muted-foreground mt-auto font-mono text-xs">
              {t("membersCount", { count: community.memberCount })}
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-4 text-right">
        <Link
          href="/communities"
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
        >
          {t("viewAll")} →
        </Link>
      </div>
    </section>
  );
}
