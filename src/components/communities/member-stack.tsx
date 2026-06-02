"use client";

import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import {
  shouldRenderStack,
  overflowCount,
  type StackFace,
} from "@/server/communities/member-stack";
import { api } from "@/trpc/react";

function initial(displayName: string | null): string {
  return (displayName ?? "?").trim()[0]?.toUpperCase() ?? "?";
}

export interface MemberStackViewProps {
  faces: StackFace[];
  /** Active-member total (includes private members). */
  total: number;
  className?: string;
}

/** Presentational stacked-avatar row. Renders nothing unless the community
 *  clears the threshold AND has at least one showable face. */
export function MemberStackView({ faces, total, className }: MemberStackViewProps) {
  if (!shouldRenderStack(total) || faces.length === 0) return null;

  const overflow = overflowCount(total, faces.length);

  return (
    <AvatarGroup
      className={className}
      aria-label={`${total} members`}
      data-slot="member-stack"
    >
      {faces.map((face) => (
        <Avatar key={face.userId} size="sm">
          {face.image ? (
            <AvatarImage src={face.image} alt={face.displayName ?? ""} />
          ) : null}
          <AvatarFallback className="text-[10px]">
            {initial(face.displayName)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 ? (
        <AvatarGroupCount className="text-[10px]">+{overflow}</AvatarGroupCount>
      ) : null}
    </AvatarGroup>
  );
}

export interface MemberStackProps {
  slug: string;
  className?: string;
}

/** Self-fetching member stack for the community header. Renders nothing while
 *  loading or when policy/access hides it. */
export function MemberStack({ slug, className }: MemberStackProps) {
  const { data } = api.communities.getMemberStack.useQuery({ slug });
  if (!data) return null;
  return (
    <MemberStackView faces={data.faces} total={data.total} className={className} />
  );
}
