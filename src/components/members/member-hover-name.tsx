"use client";

import { Link } from "@/i18n/navigation";
import { profileTabHref } from "@/lib/member-profile-routes";
import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { MemberCard } from "@/server/members/member-card";

import { MemberPreviewCard } from "./member-preview-card";

/** A member as a name in running text: who, how they look, their card. */
export type NamedMember = {
  userId: string;
  name: string;
  image: string | null;
  card: MemberCard;
};

/**
 * A member's name wherever it appears in a sentence or a byline. It links
 * to their profile when this viewer may open it (the server decides, in
 * `member-card.ts`), and hovering or focusing it previews who they are. A
 * private profile is not linked; its preview says so. On touch devices
 * there is no hover; a tap opens the profile.
 */
export function MemberHoverName({
  member,
  className,
}: {
  member: NamedMember;
  className?: string;
}) {
  const { card } = member;
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {card.canOpenProfile ? (
          <Link
            href={profileTabHref(member.userId, "overview")}
            className={cn(
              "focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]",
              className,
            )}
          >
            {member.name}
          </Link>
        ) : (
          <span className={cn("font-medium", className)}>{member.name}</span>
        )}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <MemberPreviewCard
          name={member.name}
          image={member.image}
          bio={card.bio}
          profile={card.profile}
          canOpenProfile={card.canOpenProfile}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
