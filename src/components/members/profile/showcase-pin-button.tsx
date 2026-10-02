"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The owner's "Pin to showcase" / "Unpin" control on a badge (Badges tab).
 * When the showcase is full, Pin is aria-disabled (still focusable) and
 * described by the hint that says why; the three pins are on the same page
 * with their own Unpin.
 * The server re-checks everything (held, displayable, at most three).
 */
export function ShowcasePinButton({
  slug,
  pinnedSlug,
  full,
  hintId,
  badgeName,
}: {
  /** The badge this control pins. */
  slug: string;
  /** The stored pin this badge's line is shown by, or null if not pinned. */
  pinnedSlug: string | null;
  /** The showcase already holds the maximum. */
  full: boolean;
  /** Id of the showcase hint, which explains a disabled Pin. */
  hintId: string;
  badgeName: string;
}) {
  const t = useTranslations("memberProfile.badges");
  const router = useRouter();
  const onSuccess = () => router.refresh();
  const pin = api.badges.pin.useMutation({ onSuccess });
  const unpin = api.badges.unpin.useMutation({ onSuccess });
  const pinned = pinnedSlug !== null;
  const busy = pin.isPending || unpin.isPending;
  const failed = pin.isError || unpin.isError;
  const blocked = !pinned && full;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={pinned ? "ghost" : "outline"}
        // Blocked stays focusable (aria-disabled, not disabled) so a
        // keyboard or screen-reader user reaches it and hears the hint.
        disabled={busy}
        aria-disabled={blocked || undefined}
        className={cn(blocked && "cursor-not-allowed opacity-50")}
        aria-label={
          pinned
            ? t("unpinLabel", { name: badgeName })
            : t("pinLabel", { name: badgeName })
        }
        aria-describedby={blocked ? hintId : undefined}
        onClick={() => {
          if (blocked) return;
          pin.reset();
          unpin.reset();
          if (pinnedSlug !== null) unpin.mutate({ slug: pinnedSlug });
          else pin.mutate({ slug });
        }}
      >
        {busy
          ? pinned
            ? t("unpinning")
            : t("pinning")
          : pinned
            ? t("unpin")
            : t("pin")}
      </Button>
      {failed && (
        <p role="alert" className="text-destructive text-xs">
          {t("pinError")}
        </p>
      )}
    </div>
  );
}
