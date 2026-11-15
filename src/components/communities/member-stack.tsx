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
  isStackShown,
  presentStack,
  type StackFace,
} from "@/server/communities/member-stack";

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

  if (!isStackShown(faces, total)) return null;

  const { shownFaces, overflow } = presentStack(faces, total);

  return (
    <TooltipProvider delayDuration={150}>
      <AvatarGroup
        className={className}
        // A labelled group, so screen readers announce the member count:
        // there is no visible "N members" line beside the faces.
        role="group"
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
