import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";

interface CommunityCardProps {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  joinPolicy: string;
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
}: CommunityCardProps) {
  const t = useTranslations("communities");

  return (
    <Link
      href={`/communities/${slug}`}
      className="border-border hover:bg-secondary/50 flex items-start gap-4 rounded-lg border p-4 transition-colors"
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

        <span className="text-muted-foreground mt-1 font-mono text-[11px] tracking-wider">
          {memberCount} {t("profile.members").toLowerCase()}
        </span>
      </div>
    </Link>
  );
}
