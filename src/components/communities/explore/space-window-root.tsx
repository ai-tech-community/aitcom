"use client";

import { useCallback, useRef, useState } from "react";
import { Hash, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "@/components/community/building-modal";
import { RoomView } from "@/components/communities/rooms/room-view";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { useSpaceWindows } from "./space-window-provider";
import { windowKey } from "./space-window-reducer";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { cn } from "@/lib/utils";

// Mounted while any space window exists (open OR parked in the taskbar); relies
// on the module-level singleton in useInboxStream so all windows (and the
// inbox) share ONE EventSource. Keeping it alive for minimized windows keeps
// their unread/last-message state live so restoring is instant.
function SpaceWindowStream() {
  useInboxStream();
  return null;
}

export function SpaceWindowRoot({
  aboveMobileNav = false,
}: { aboveMobileNav?: boolean } = {}) {
  const { open, minimized, closeSpace, minimizeSpace, restoreSpace } =
    useSpaceWindows();
  const { data: session } = authClient.useSession();
  const redesigned = isOpenCommunitiesEnabled();
  const t = useTranslations("communities.discover");

  // Keys mid-close: the window stays mounted with isOpen={false} so its exit
  // animation can play; real removal happens on the modal's onExitComplete.
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const focusParked = useRef<string | null>(null);

  const beginClose = useCallback((key: string) => {
    setClosingKeys((prev) => new Set(prev).add(key));
  }, []);

  const finishClose = useCallback(
    (key: string) => {
      closeSpace(key);
      setClosingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [closeSpace],
  );

  if (!session?.user) return null;

  return (
    <>
      {(open.length > 0 || minimized.length > 0) && <SpaceWindowStream />}

      {open.map((ref, i) => {
        const key = windowKey(ref);
        return (
          <BuildingModal
            key={key}
            isOpen={!closingKeys.has(key)}
            title={ref.spaceName ?? ref.spaceSlug}
            roomWindow={
              redesigned ? { community: ref.communityName } : undefined
            }
            windowIndex={i}
            onClose={() => beginClose(key)}
            onMinimize={() => {
              if (redesigned) focusParked.current = key;
              minimizeSpace(key);
            }}
            onExitComplete={() => finishClose(key)}
          >
            <RoomView
              slug={ref.communitySlug}
              spaceSlug={ref.spaceSlug}
              fillHeight
            />
          </BuildingModal>
        );
      })}

      {minimized.length > 0 && (
        <div
          className={cn(
            "fixed left-3 z-40 flex flex-wrap items-end gap-2 sm:left-4",
            aboveMobileNav
              ? "bottom-[calc(var(--community-mobile-bar-height)+0.75rem)] lg:bottom-4"
              : "bottom-3 sm:bottom-4",
          )}
        >
          {minimized.map((ref) => {
            const key = windowKey(ref);
            const label = ref.spaceName ?? ref.spaceSlug;
            return (
              <button
                key={key}
                ref={
                  redesigned
                    ? (element) => {
                        if (element && focusParked.current === key) {
                          focusParked.current = null;
                          element.focus();
                        }
                      }
                    : undefined
                }
                type="button"
                onClick={() => restoreSpace(key)}
                className={cn(
                  "border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-t-lg border px-3 py-2 font-mono text-xs tracking-wider transition-colors",
                  redesigned &&
                    "focus-visible:ring-ring min-h-11 rounded-lg font-sans text-sm tracking-normal focus-visible:ring-2 focus-visible:outline-none",
                )}
                aria-label={t("restoreSpace", { space: label })}
                title={t("restoreSpace", { space: label })}
              >
                {redesigned ? (
                  <Hash aria-hidden className="size-4" />
                ) : (
                  <Terminal aria-hidden className="size-3.5" />
                )}
                <span className="max-w-32 truncate">
                  {redesigned ? label : label.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
