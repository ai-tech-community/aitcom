"use client";

import { Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "@/components/community/building-modal";
import { RoomView } from "@/components/communities/rooms/room-view";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { useSpaceWindows } from "./space-window-provider";
import { windowKey } from "./space-window-reducer";

// Mounted only while a window is open; relies on the module-level singleton in
// useInboxStream so all windows (and the inbox) share ONE EventSource.
function SpaceWindowStream() {
  useInboxStream();
  return null;
}

export function SpaceWindowRoot() {
  const { open, minimized, closeSpace, minimizeSpace, restoreSpace } = useSpaceWindows();
  const { data: session } = authClient.useSession();
  const t = useTranslations("communities.discover");

  if (!session?.user) return null;

  return (
    <>
      {open.length > 0 && <SpaceWindowStream />}

      {open.map((ref, i) => {
        const key = windowKey(ref);
        return (
          <BuildingModal
            key={key}
            isOpen
            title={ref.spaceName ?? ref.spaceSlug}
            windowIndex={i}
            onClose={() => closeSpace(key)}
            onMinimize={() => minimizeSpace(key)}
          >
            <RoomView slug={ref.communitySlug} spaceSlug={ref.spaceSlug} fillHeight />
          </BuildingModal>
        );
      })}

      {minimized.length > 0 && (
        <div className="fixed bottom-3 left-3 z-40 flex flex-wrap items-end gap-2 sm:bottom-4 sm:left-4">
          {minimized.map((ref) => {
            const key = windowKey(ref);
            const label = ref.spaceName ?? ref.spaceSlug;
            return (
              <button
                key={key}
                type="button"
                onClick={() => restoreSpace(key)}
                className="border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-t-lg border px-3 py-2 font-mono text-xs tracking-wider transition-colors"
                aria-label={t("restoreSpace", { space: label })}
                title={t("restoreSpace", { space: label })}
              >
                <Terminal aria-hidden className="size-3.5" />
                <span className="max-w-32 truncate">{label.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
