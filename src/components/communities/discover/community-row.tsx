"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";

type Face = { userId: string; displayName: string | null; avatarUrl: string | null };

export function CommunityRow({
  slug, name, description, logoUrl, memberCount, faces: _faces,
}: {
  slug: string; name: string; description: string | null;
  logoUrl: string | null; memberCount: number; faces: Face[];
}) {
  const t = useTranslations("communities.discover");
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      {logoUrl ? (
        <Avatar size="sm" className="rounded-md">
          <AvatarImage src={logoUrl} alt="" />
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
      ) : (
        <SpaceAvatar name={name} />
      )}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">{name}</span>
        {description ? (
          <p className="text-muted-foreground truncate text-sm">{description}</p>
        ) : null}
      </div>
      <span className="text-muted-foreground hidden shrink-0 font-mono text-xs sm:inline">
        {t("membersCount", { count: memberCount })}
      </span>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/communities/${slug}`}>{t("view")}</Link>
      </Button>
    </li>
  );
}
