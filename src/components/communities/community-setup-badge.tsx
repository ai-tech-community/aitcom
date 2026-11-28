import type { CommunityTheme } from "@/lib/communities/themes";
import { cn } from "@/lib/utils";

/** The same catalog-backed monogram in the preview and the community rail. */
export function CommunitySetupBadge({
  name,
  theme,
  className,
}: {
  name: string;
  theme: CommunityTheme;
  className?: string;
}) {
  const initial = /[\p{L}\p{N}]/u.exec(name)?.[0].toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      data-community-setup-badge=""
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg text-lg leading-none font-semibold",
        className,
      )}
      style={{
        backgroundColor: theme.tokens.foreground,
        color: theme.tokens.background,
      }}
    >
      {initial}
    </span>
  );
}
