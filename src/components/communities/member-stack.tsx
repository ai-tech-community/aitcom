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
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
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
  showMemberCount?: boolean;
}

/** Presentational stacked-avatar row. Renders nothing unless the community
 *  clears the threshold AND has at least one showable face. */
export function MemberStackView({
  faces,
  total,
  className,
  showMemberCount = false,
}: MemberStackViewProps) {
  const t = useTranslations("communities.stack");

  if (!isStackShown(faces, total)) return null;

  const { shownFaces, overflow } = presentStack(faces, total);
  const label = t("label", { count: total });
  const groupProps = {
    role: "group",
    "aria-label": label,
    "data-slot": "member-stack",
  } as const;
  const avatars = shownFaces.map((face) => {
    const name = face.displayName ?? t("memberFallback");
    return (
      <Tooltip key={face.userId}>
        <TooltipTrigger asChild>
          <Avatar
            size={showMemberCount ? "default" : "sm"}
            className={cn(
              "cursor-default",
              showMemberCount && "ring-background size-9 ring-2",
            )}
            role={showMemberCount ? "img" : undefined}
            aria-label={showMemberCount ? name : undefined}
          >
            {face.image ? (
              <AvatarImage
                src={face.image}
                alt={showMemberCount ? "" : (face.displayName ?? "")}
              />
            ) : null}
            <AvatarFallback
              className={cn("text-xs", showMemberCount && "font-medium")}
              aria-hidden={showMemberCount || undefined}
            >
              {showMemberCount ? getInitials(name) : initial(face.displayName)}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    );
  });

  return (
    <TooltipProvider delayDuration={150}>
      {showMemberCount ? (
        <div
          {...groupProps}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1",
            className,
          )}
        >
          <AvatarGroup className="-space-x-1.5">{avatars}</AvatarGroup>
          <span aria-hidden="true" className="text-muted-foreground text-sm">
            {label}
          </span>
        </div>
      ) : (
        <AvatarGroup {...groupProps} className={className}>
          {avatars}
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
      )}
    </TooltipProvider>
  );
}
