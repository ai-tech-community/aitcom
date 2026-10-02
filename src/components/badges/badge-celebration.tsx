"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { catalogBadge } from "@/lib/badges/catalog";
import { showcasePinState } from "@/lib/badges/showcase";
import { badgeShareHref, profileTabHref } from "@/lib/member-profile-routes";
import { cn } from "@/lib/utils";
import type {
  UnseenEarning,
  UnseenEarnings,
} from "@/server/badges/earning-moment";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { BadgeEmblem, emblemOutline, type EmblemSubject } from "./badge-emblem";
import { isCelebrationRoute } from "./celebration-route";
import { useBadgeText } from "./use-badge-text";
import { useRarityLabel } from "./use-rarity-label";

/** When the browser has no idle callback: after first paint has settled. */
const FALLBACK_DELAY_MS = 1000;
/** Longest wait for an idle moment before asking anyway. */
const IDLE_TIMEOUT_MS = 3000;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * True once the page has painted and the browser is idle, so the unseen
 * query never competes with navigation or hydration.
 */
function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), {
        timeout: IDLE_TIMEOUT_MS,
      });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}

/**
 * The earning moment (ADR-0039): once per page load, a signed-in member
 * with unseen badges or awards gets a short celebration of them. Mounted
 * once in the session chrome, for signed-in members only.
 *
 * It asks for unseen earnings only after first paint, when the browser is
 * idle, and never on routes that need the member's focus (sign-in,
 * onboarding). It asks once: after the dialog closes (or when there is
 * nothing to show) it stays quiet until the next full page load.
 */
export function BadgeCelebration({ userId }: { userId: string }) {
  const pathname = usePathname();
  const ready = useIdleReady();
  const [phase, setPhase] = useState<
    | { kind: "waiting" }
    | { kind: "open"; earnings: UnseenEarnings }
    | { kind: "done" }
  >({ kind: "waiting" });
  const onRoute = isCelebrationRoute(pathname);
  const waiting = phase.kind === "waiting";
  const unseen = api.badges.unseen.useQuery(undefined, {
    enabled: ready && onRoute && waiting,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  useEffect(() => {
    if (!waiting) return;
    // Supplementary: a failed load just means no celebration this time.
    if (unseen.isError) setPhase({ kind: "done" });
    if (!unseen.data || !onRoute) return;
    setPhase(
      unseen.data.items.length > 0
        ? { kind: "open", earnings: unseen.data }
        : { kind: "done" },
    );
  }, [waiting, unseen.data, unseen.isError, onRoute]);

  if (phase.kind !== "open") return null;
  return (
    <BadgeCelebrationDialog
      userId={userId}
      earnings={phase.earnings}
      onDone={() => setPhase({ kind: "done" })}
    />
  );
}

type CopyState = "idle" | "copied" | "manual";

/**
 * The celebration itself: one earning at a time (emblem, name, kind,
 * rarity, description), with "Show on my profile", "Share" and Close.
 * Closing it in any way (Close, Esc, outside click, a link) marks every
 * earning it covered as seen; pinning or sharing marks that one at once.
 */
export function BadgeCelebrationDialog({
  userId,
  earnings,
  onDone,
}: {
  userId: string;
  earnings: UnseenEarnings;
  onDone: () => void;
}) {
  const t = useTranslations("badgeMoment.celebration");
  const tMoment = useTranslations("badgeMoment");
  const locale = useLocale();
  const badgeText = useBadgeText();
  const { items, moreIds } = earnings;
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [pins, setPins] = useState(earnings.pins);
  const [pinFailed, setPinFailed] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const shareId = useId();
  const marked = useRef(new Set<string>());
  // Where focus was when the celebration opened; it returns there after.
  const [returnFocusTo] = useState(() =>
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );

  const markSeen = api.badges.markSeen.useMutation();
  const pin = api.badges.pin.useMutation();

  const current = items[index];
  const rarityLabel = useRarityLabel(
    current?.kind === "badge" && current.rarity
      ? { members: 0, badges: [current.rarity] }
      : null,
  );
  if (!current) return null;

  const last = index === items.length - 1;
  const badge = current.kind === "badge" ? catalogBadge(current.slug) : null;
  const text = badge ? badgeText(badge) : null;
  const subject: EmblemSubject =
    current.kind === "badge"
      ? { kind: "badge", slug: current.slug }
      : { kind: "award", label: current.label };
  const { shape, colours } = emblemOutline(subject);

  function mark(ids: readonly string[]) {
    const fresh = ids.filter((id) => !marked.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) marked.current.add(id);
    markSeen.mutate({ ids: fresh });
  }

  function close() {
    mark([...items.map((item) => item.id), ...moreIds]);
    setOpen(false);
  }

  function showNext() {
    mark([current!.id]);
    setShareUrl(null);
    setCopy("idle");
    pin.reset();
    setIndex((i) => i + 1);
  }

  function pinCurrent(item: Extract<UnseenEarning, { kind: "badge" }>) {
    mark([item.id]);
    pin.mutate(
      { slug: item.slug },
      {
        onSuccess: (result) => setPins(result.pins),
        onError: () => setPinFailed(item.id),
      },
    );
  }

  function openShare(slug: string) {
    mark([current!.id]);
    setCopy("idle");
    setShareUrl(
      `${window.location.origin}/${locale}${badgeShareHref(userId, slug)}`,
    );
  }

  function copyLink() {
    const url = shareUrl;
    if (!url) return;
    const manual = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopy("manual");
    };
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) {
      manual();
      return;
    }
    clipboard.writeText(url).then(() => setCopy("copied"), manual);
  }

  const badgesHref = profileTabHref(userId, "badges");
  const pinState =
    current.kind === "badge" && pins !== null
      ? pinFailed === current.id
        ? "full"
        : showcasePinState(pins, current.slug)
      : null;
  const seeBadges = (
    <Button asChild variant="outline">
      <Link href={badgesHref} onClick={close}>
        {t("seeBadges")}
      </Link>
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Opened by the page, not a trigger: Radix would drop focus on the
        // body, so it goes back to where it was. Then the moment is over.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusTo?.isConnected) returnFocusTo.focus();
          onDone();
        }}
        className="gap-6 sm:max-w-md"
        data-testid="badge-celebration"
      >
        {items.length > 1 && (
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {t("progress", { current: index + 1, total: items.length })}
          </p>
        )}

        <div className="flex flex-col items-center gap-4 text-center">
          {/* key: each earning gets its own entrance. */}
          <div
            key={current.id}
            className="relative grid size-32 place-items-center"
            data-testid="celebration-emblem"
          >
            <svg
              viewBox="-12.5 -12.5 125 125"
              aria-hidden
              focusable={false}
              className="absolute inset-0 size-full overflow-visible"
              style={colours}
            >
              <path
                d={shape.d}
                pathLength={100}
                strokeDasharray="100"
                fill="none"
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: "var(--emblem-ink)" }}
                className="motion-safe:animate-emblem-ring"
                data-testid="celebration-ring"
              />
            </svg>
            <div className="motion-safe:animate-emblem-arrive">
              <BadgeEmblem
                subject={subject}
                state={{ earned: true, earnedAt: current.earnedAt }}
                size="lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <DialogTitle className="text-xl leading-tight text-balance">
              {current.kind === "badge"
                ? t("title", { badge: text?.name ?? "" })
                : t("awardTitle")}
            </DialogTitle>
            <p className="text-muted-foreground font-mono text-xs">
              {current.kind === "badge"
                ? (text?.kind ?? "")
                : tMoment("kind.award")}
            </p>
          </div>
          <DialogDescription className="text-foreground max-w-prose text-sm">
            {current.kind === "badge"
              ? (text?.description ?? "")
              : current.label}
          </DialogDescription>
          {current.kind === "badge" && rarityLabel(current.slug) && (
            <p className="text-muted-foreground font-mono text-xs">
              {rarityLabel(current.slug)}
            </p>
          )}
        </div>

        {shareUrl && (
          <div className="space-y-2">
            <label htmlFor={shareId} className="text-sm font-medium">
              {t("shareLabel")}
            </label>
            <div className="flex gap-2">
              <Input
                id={shareId}
                ref={inputRef}
                readOnly
                value={shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={copyLink}>
                {copy === "copied" ? t("copied") : t("copy")}
              </Button>
            </div>
            <p
              role="status"
              className={cn(
                "text-muted-foreground text-xs",
                copy === "idle" && "sr-only",
              )}
            >
              {copy === "copied"
                ? t("copiedStatus")
                : copy === "manual"
                  ? t("copyManual")
                  : ""}
            </p>
            {current.kind === "badge" && (
              <Link
                href={badgeShareHref(userId, current.slug)}
                onClick={close}
                className="text-sm underline underline-offset-4"
              >
                {t("openPage")}
              </Link>
            )}
          </div>
        )}

        {last && moreIds.length > 0 && (
          <p className="text-muted-foreground text-center text-sm">
            {t.rich("more", {
              count: moreIds.length,
              link: (chunks) => (
                <Link
                  href={badgesHref}
                  onClick={close}
                  className="text-foreground underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {current.kind === "badge" && pinState === "open" && (
              <Button
                type="button"
                disabled={pin.isPending}
                onClick={() => pinCurrent(current)}
              >
                {pin.isPending ? t("pinning") : t("pin")}
              </Button>
            )}
            {pinState === "full" && seeBadges}
            {current.kind === "award" && seeBadges}
            {current.kind === "badge" && pins !== null && !shareUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => openShare(current.slug)}
              >
                {t("share")}
              </Button>
            )}
            {last ? (
              <Button type="button" variant="ghost" onClick={close}>
                {t("close")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={showNext}>
                {t("next")}
              </Button>
            )}
          </div>
          {pinState === "pinned" && (
            <p
              role="status"
              className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm"
            >
              <Check className="size-4" aria-hidden />
              {t("pinned")}
            </p>
          )}
          {pinState === "full" && (
            <p
              role={pinFailed === current.id ? "alert" : undefined}
              className="text-muted-foreground text-center text-sm"
            >
              {pinFailed === current.id ? t("pinError") : t("full")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
