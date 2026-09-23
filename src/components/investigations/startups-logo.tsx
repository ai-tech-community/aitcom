import {
  displayStartupLogoUrl,
  startupMonogram,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

const SIZES = {
  /** Directory row. */
  sm: { box: "size-9 rounded-md", text: "text-sm", px: 36 },
  /** Profile header; fills the crop-mark frame. */
  lg: { box: "size-full rounded-lg", text: "text-3xl", px: 108 },
} as const;

/**
 * The sourced logo, or a letters-only monogram when none is on record.
 * Never a guessed favicon or an invented mark.
 */
export function StartupLogo({
  card,
  size,
}: {
  card: Pick<StartupPublicCard, "name" | "logoUrl">;
  size: keyof typeof SIZES;
}) {
  const logoUrl = displayStartupLogoUrl(card.logoUrl);
  const { box, text, px } = SIZES[size];

  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={px}
      height={px}
      loading={size === "sm" ? "lazy" : undefined}
      data-startup-logo={logoUrl}
      className={cn(
        "border-border bg-background shrink-0 border object-cover",
        box,
      )}
    />
  ) : (
    <div
      aria-hidden="true"
      data-startup-monogram=""
      className={cn(
        "bg-muted text-foreground/70 flex shrink-0 items-center justify-center font-semibold tracking-tight",
        box,
        text,
      )}
    >
      {startupMonogram(card.name)}
    </div>
  );
}
