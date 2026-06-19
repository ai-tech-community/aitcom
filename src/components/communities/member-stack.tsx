"use client";

import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import {
  shouldRenderStack,
  presentStack,
  type StackFace,
} from "@/server/communities/member-stack";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";

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
export function MemberStackView({
  faces,
  total,
  className,
}: MemberStackViewProps) {
  const t = useTranslations("communities.stack");

  if (!shouldRenderStack(total) || faces.length === 0) return null;

  const { shownFaces, overflow } = presentStack(faces, total);

  return (
    <TooltipProvider delayDuration={150}>
      <AvatarGroup
        className={className}
        aria-label={t("label", { count: total })}
        data-slot="member-stack"
      >
        {shownFaces.map((face) => (
          <Tooltip key={face.userId}>
            <TooltipTrigger asChild>
              <Avatar size="sm" className="cursor-default">
                {face.image ? (
                  <AvatarImage src={face.image} alt={face.displayName ?? ""} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initial(face.displayName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              {face.displayName ?? t("memberFallback")}
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <AvatarGroupCount className="cursor-default text-xs">
                +{overflow}
              </AvatarGroupCount>
            </TooltipTrigger>
            <TooltipContent>
              {t("overflow", { count: overflow })}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </AvatarGroup>
    </TooltipProvider>
  );
}

export interface MemberStackProps {
  slug: string;
  className?: string;
}

/** Self-fetching member stack for the community header. Renders nothing while
 *  loading or when policy/access hides it. */
export function MemberStack({ slug, className }: MemberStackProps) {
  const { data, isLoading, isError } = api.communities.getMemberStack.useQuery({
    slug,
  });
  if (isError) return null; // supplementary widget — may stay absent on error (No-Silent-Failure)
  if (isLoading) {
    return (
      <div className={className} aria-hidden="true">
        <div className="flex -space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-7 rounded-full" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;
  return (
    <MemberStackView
      faces={data.faces}
      total={data.total}
      className={className}
    />
  );
}
