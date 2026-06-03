import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { MemberStackView } from "./member-stack";
import {
  shouldRenderStack,
  type StackFace,
} from "@/server/communities/member-stack";

interface CommunityCardProps {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  joinPolicy: string;
  faces: StackFace[];
}

const JOIN_POLICY_KEY: Record<string, string> = {
  open: "joinPolicyOpen",
  invite_only: "joinPolicyInviteOnly",
  approval_required: "joinPolicyApprovalRequired",
};

export function CommunityCard({
  slug,
  name,
  description,
  logoUrl,
  memberCount,
  joinPolicy,
  faces,
}: CommunityCardProps) {
  const t = useTranslations("communities");

  return (
    <Link
      href={`/communities/${slug}`}
      className="border-border hover:bg-secondary/50 flex min-w-0 items-start gap-4 rounded-lg border p-4 transition-colors"
    >
      {/* Logo / Fallback */}
      <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={name}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground font-mono text-lg font-semibold">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {t(`create.${JOIN_POLICY_KEY[joinPolicy] ?? "joinPolicyOpen"}`)}
          </Badge>
        </div>

        {description && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {description}
          </p>
        )}

        <div className="mt-1">
          {shouldRenderStack(memberCount) && faces.length > 0 ? (
            <MemberStackView faces={faces} total={memberCount} />
          ) : (
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
              {t("stack.label", { count: memberCount })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
