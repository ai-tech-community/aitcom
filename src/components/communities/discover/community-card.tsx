"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";
import { type StackFace } from "@/server/communities/member-stack";
import { MemberStackView } from "@/components/communities/member-stack";

export function CommunityCard({
  slug,
  name,
  description,
  logoUrl,
  memberCount,
  faces,
}: {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  faces: StackFace[];
}) {
  const t = useTranslations("communities.discover");
  return (
    <Link
      href={`/communities/${slug}`}
      className="border-border hover:border-foreground/30 hover:bg-muted/40 flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <Avatar size="sm" className="rounded-md">
            <AvatarImage src={logoUrl} alt="" />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        ) : (
          <SpaceAvatar name={name} />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</p>
      </div>
      {description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">{description}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between">
        <MemberStackView faces={faces} total={memberCount} />
        <span className="text-muted-foreground font-mono text-xs">
          {t("membersCount", { count: memberCount })}
        </span>
      </div>
    </Link>
  );
}
