"use client";

import { useTranslations } from "next-intl";
import { Hash } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { SectionLabel } from "@/components/ui/section-label";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";

type Rooms = RouterOutputs["spaces"]["squareRooms"];
type TalkingRoom = Rooms["talking"][number];
type QuietRoom = Rooms["quiet"][number];
type AnyRoom = TalkingRoom | QuietRoom;

/** "panel": the sticky side column (xl up). "strip": a row under the street. */
export type SquareRoomsLayout = "panel" | "strip";

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

function RoomButton({
  room,
  layout,
}: {
  room: AnyRoom;
  layout: SquareRoomsLayout;
}) {
  const t = useTranslations("communities.discover");
  const open = useOpenRoom();
  const label = room.spaceName ?? t("roomFallback");
  const talking = isTalking(room);
  const detail = talking
    ? [
        room.people > 0 ? t("peopleTalking", { count: room.people }) : null,
        room.agents > 0 ? t("agentsTalking", { count: room.agents }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("sayHi");
  return (
    <li className={cn(layout === "strip" && "w-64 shrink-0 sm:w-auto")}>
      <button
        type="button"
        onClick={() => open(room, label)}
        aria-label={`${t("openSpace", { space: label })}, ${t("inCommunity", { community: room.communityName })}, ${detail}`}
        className={cn(
          "focus-visible:ring-ring/50 flex w-full flex-col gap-1 text-left transition-colors outline-none focus-visible:ring-[3px]",
          layout === "panel"
            ? "hover:bg-muted/50 rounded-lg px-3 py-2.5"
            : "border-border hover:border-foreground/30 h-full rounded-xl border p-4",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {talking ? (
            <span
              aria-hidden="true"
              className="bg-success size-2 shrink-0 rounded-full"
            />
          ) : (
            <Hash
              aria-hidden="true"
              className="text-muted-foreground size-3.5 shrink-0"
            />
          )}
          <span
            className="min-w-0 truncate text-sm font-semibold"
            title={label}
          >
            {talking ? `#${label}` : label}
          </span>
        </span>
        <span
          className="text-muted-foreground truncate text-sm"
          title={room.communityName}
        >
          {t("inCommunity", { community: room.communityName })}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            talking ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      </button>
    </li>
  );
}

function RoomList({
  rooms,
  layout,
  className,
}: {
  rooms: readonly AnyRoom[];
  layout: SquareRoomsLayout;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        layout === "panel"
          ? "-mx-3 flex flex-col gap-0.5"
          : "-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4",
        className,
      )}
    >
      {rooms.map((room) => (
        <RoomButton key={room.spaceId} room={room} layout={layout} />
      ))}
    </ul>
  );
}

/**
 * The rooms on the square, the low-commitment way into a community: look
 * into a conversation before joining. "Talking now" lists rooms where
 * people or agents wrote in the last day; "Open rooms" lists the quiet
 * ones with a "say hi", so there is always a door to open. Renders
 * nothing when no listed community has a public room.
 */
export function SquareRooms({
  layout,
  className,
}: {
  layout: SquareRoomsLayout;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const query = api.spaces.squareRooms.useQuery();
  const talking = query.data?.talking ?? [];
  const quiet = query.data?.quiet ?? [];
  if (talking.length === 0 && quiet.length === 0) return null;

  if (layout === "strip") {
    return (
      <section aria-labelledby="rooms-strip-title" className={className}>
        <SectionLabel id="rooms-strip-title">
          {talking.length > 0 ? t("talkingNow") : t("openRoomsTitle")}
        </SectionLabel>
        <p className="text-muted-foreground mt-2 text-sm">
          {talking.length > 0 ? t("talkingNowHint") : t("openRoomsHint")}
        </p>
        <RoomList
          rooms={[...talking, ...quiet]}
          layout="strip"
          className="mt-4"
        />
      </section>
    );
  }

  const more = (query.data?.quietTotal ?? 0) - quiet.length;
  return (
    <aside aria-label={t("roomsPanelLabel")} className={className}>
      {talking.length > 0 ? (
        <section aria-labelledby="talking-now-title">
          <SectionLabel id="talking-now-title">{t("talkingNow")}</SectionLabel>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("talkingNowHint")}
          </p>
          <RoomList rooms={talking} layout="panel" className="mt-3" />
        </section>
      ) : null}
      {quiet.length > 0 ? (
        <section
          aria-labelledby="open-rooms-title"
          className={cn(talking.length > 0 && "mt-8")}
        >
          <SectionLabel id="open-rooms-title">
            {t("openRoomsTitle")}
          </SectionLabel>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("openRoomsHint")}
          </p>
          <RoomList rooms={quiet} layout="panel" className="mt-3" />
          {more > 0 ? (
            <p className="text-muted-foreground mt-3 text-xs">
              {t("moreRooms", { count: more })}
            </p>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
