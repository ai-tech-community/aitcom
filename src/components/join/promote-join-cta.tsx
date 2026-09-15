import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HUB_OPEN_HREF } from "@/lib/join-path";

/**
 * Guest: hard www /en/join (plus page UTMs on `guestHref`).
 * Signed-in Hub member: Open Hub forum — never Join.
 */
export function PromoteJoinCta({
  promoteJoin,
  guestHref,
  guestLabel,
  hubLabel,
  variant = "default",
}: {
  promoteJoin: boolean;
  guestHref: string;
  guestLabel: string;
  hubLabel: string;
  variant?: "default" | "outline";
}) {
  const guestIsAbsolute = /^https?:\/\//.test(guestHref);

  return (
    <Button asChild variant={variant}>
      {promoteJoin ? (
        guestIsAbsolute ? (
          <a href={guestHref}>{guestLabel}</a>
        ) : (
          <Link href={guestHref}>{guestLabel}</Link>
        )
      ) : (
        <Link href={HUB_OPEN_HREF}>{hubLabel}</Link>
      )}
    </Button>
  );
}
