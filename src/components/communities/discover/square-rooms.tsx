"use client";

import { useTranslations } from "next-intl";
import { Hash } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";

type Rooms = RouterOutputs["spaces"]["squareRooms"];
type TalkingRoom = Rooms["talking"][number];
type QuietRoom = Rooms["quiet"][number];
type AnyRoom = TalkingRoom | QuietRoom;

/** Rooms per part of the strip, so it never pushes the directory far down. */
export const STRIP_ROOMS = 4;

/** The square's rooms, shared by the page layout and the room lists. */
export function useSquareRooms() {
  return api.spaces.squareRooms.useQuery();
}

function isTalking(room: AnyRoom): room is TalkingRoom {
  return "people" in room;
}

/** Opens a room's chat window; guests sign in first. */
function useOpenRoom() {
  const t = useTranslations("communities.discover");
  const { openSpace } = useSpaceWindows();
  const { requireAuth } = useRequireAuth();
  return (room: AnyRoom, label: string) =>
    requireAuth(
      () =>
        openSpace({
          communitySlug: room.communitySlug,
          spaceSlug: room.spaceSlug,
          spaceName: room.spaceName,
          communityName: room.communityName,
        }),
      t("signInToOpenSpace", { space: label }),
    );
}

type Variant = "panel" | "strip";

function RoomButton({ room, variant }: { room: AnyRoom; variant: Variant }) {
  const t = useTranslations("communities.discover");
  const open = useOpenRoom();
  const label = room.spaceName ?? t("roomFallback");
  const talking = isTalking(room);
  const who = talking
    ? [
        room.people > 0 ? t("peopleTalking", { count: room.people }) : null,
        room.agents > 0 ? t("agentsTalking", { count: room.agents }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("roomMembers", { count: room.members });
  return (
    <li className={cn(variant === "strip" && "w-64 shrink-0 sm:w-auto")}>
      <button
        type="button"
        onClick={() => open(room, label)}
        aria-label={`${t("openSpace", { space: label })}, ${t("inCommunity", { community: room.communityName })}, ${who}`}
        className={cn(
          "focus-visible:ring-ring/50 flex w-full flex-col gap-1 text-left transition-colors outline-none focus-visible:ring-[3px]",
          variant === "panel"
            ? "hover:bg-muted/50 rounded-lg px-3 py-2.5"
            : "border-border hover:border-foreground/30 h-full rounded-xl border p-4",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Hash
            aria-hidden="true"
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <span
            className="min-w-0 truncate text-sm font-semibold"
            title={label}
          >
            {label}
          </span>
        </span>
        <span
          className="text-muted-foreground truncate text-sm"
          title={room.communityName}
        >
          {t("inCommunity", { community: room.communityName })}
        </span>
        {!talking && room.purpose ? (
          <span className="text-muted-foreground line-clamp-2 text-sm">
            {room.purpose}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums">
          {talking ? (
            <>
              <span
                aria-hidden="true"
                className="bg-success size-2 shrink-0 rounded-full"
              />
              <span className="text-foreground">{who}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <RelativeTime
                date={room.lastMessageAt}
                className="text-muted-foreground font-sans"
              />
            </>
          ) : (
            <span className="text-muted-foreground">
              {who} · {t("sayHi")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function RoomList({
  rooms,
  variant,
  className,
}: {
  rooms: readonly AnyRoom[];
  variant: Variant;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        variant === "panel"
          ? "flex flex-col gap-0.5"
          : "-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4",
        className,
      )}
    >
      {rooms.map((room) => (
        <RoomButton key={room.spaceId} room={room} variant={variant} />
      ))}
    </ul>
  );
}

function RoomsPart({
  id,
  title,
  hint,
  rooms,
  variant,
  className,
}: {
  id: string;
  title: string;
  hint: string;
  rooms: readonly AnyRoom[];
  variant: Variant;
  className?: string;
}) {
  if (rooms.length === 0) return null;
  return (
    <section aria-labelledby={id} className={className}>
      <SectionLabel id={id}>{title}</SectionLabel>
      <p className="text-muted-foreground mt-2 text-sm">{hint}</p>
      <RoomList
        rooms={rooms}
        variant={variant}
        className={variant === "panel" ? "-mx-3 mt-3" : "mt-4"}
      />
    </section>
  );
}

/**
 * The side panel (from `xl`): rooms talking now, then the quiet open rooms
 * with a "say hi" — the low-commitment way into a community, look into a
 * conversation before joining.
 */
export function RoomsPanel({ className }: { className?: string }) {
  const t = useTranslations("communities.discover");
  const { data } = useSquareRooms();
  const talking = data?.talking ?? [];
  const quiet = data?.quiet ?? [];
  if (talking.length === 0 && quiet.length === 0) return null;
  return (
    <aside aria-label={t("roomsPanelLabel")} className={className}>
      <RoomsPart
        id="panel-talking-title"
        title={t("talkingNow")}
        hint={t("talkingNowHint")}
        rooms={talking}
        variant="panel"
      />
      <RoomsPart
        id="panel-open-title"
        title={t("openRoomsTitle")}
        hint={t("openRoomsHint")}
        rooms={quiet}
        variant="panel"
        className={talking.length > 0 ? "mt-8" : undefined}
      />
    </aside>
  );
}

/**
 * One part of the rooms as a strip (below `xl`), capped so it never pushes
 * the directory far down: "talking" goes above the directory, "open" after
 * it, since live talk earns the top spot and quiet rooms do not.
 */
export function RoomsStrip({
  part,
  className,
}: {
  part: "talking" | "open";
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const { data } = useSquareRooms();
  const rooms = (part === "talking" ? data?.talking : data?.quiet) ?? [];
  return (
    <RoomsPart
      id={`strip-${part}-title`}
      title={part === "talking" ? t("talkingNow") : t("openRoomsTitle")}
      hint={part === "talking" ? t("talkingNowHint") : t("openRoomsHint")}
      rooms={rooms.slice(0, STRIP_ROOMS)}
      variant="strip"
      className={className}
    />
  );
}
