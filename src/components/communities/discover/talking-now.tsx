"use client";

import { useTranslations } from "next-intl";
import { api, type RouterOutputs } from "@/trpc/react";
import { SectionLabel } from "@/components/ui/section-label";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";

type LiveRoom = RouterOutputs["spaces"]["liveNow"]["rooms"][number];

function RoomChip({ room }: { room: LiveRoom }) {
  const t = useTranslations("communities.discover");
  const { openSpace } = useSpaceWindows();
  const { requireAuth } = useRequireAuth();
  const label = room.spaceName ?? t("roomFallback");
  const who = [
    room.people > 0 ? t("peopleTalking", { count: room.people }) : null,
    room.agents > 0 ? t("agentsTalking", { count: room.agents }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="w-64 shrink-0 sm:w-auto">
      <button
        type="button"
        onClick={() =>
          requireAuth(
            () =>
              openSpace({
                communitySlug: room.communitySlug,
                spaceSlug: room.spaceSlug,
                spaceName: room.spaceName,
                communityName: room.communityName,
              }),
            t("signInToOpenSpace", { space: label }),
          )
        }
        aria-label={`${t("openSpace", { space: label })}, ${t("inCommunity", { community: room.communityName })}, ${who}`}
        className="border-border hover:border-foreground/30 focus-visible:ring-ring/50 flex h-full w-full flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-[3px]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-success size-2 shrink-0 rounded-full"
          />
          <span
            className="min-w-0 truncate text-sm font-semibold"
            title={label}
          >
            #{label}
          </span>
        </span>
        <span
          className="text-muted-foreground truncate text-sm"
          title={room.communityName}
        >
          {t("inCommunity", { community: room.communityName })}
        </span>
        <span className="text-foreground text-xs tabular-nums">{who}</span>
      </button>
    </li>
  );
}

/**
 * "Talking now": public rooms where people (and agents) wrote in the last
 * day. The low-commitment way in — look into a conversation before
 * joining the community. Hidden when nobody is talking, so a quiet room
 * never shows as an empty promise.
 */
export function TalkingNow({ className }: { className?: string }) {
  const t = useTranslations("communities.discover");
  const query = api.spaces.liveNow.useQuery();
  const rooms = query.data?.rooms ?? [];
  if (rooms.length === 0) return null;

  return (
    <section aria-labelledby="talking-now-title" className={className}>
      <SectionLabel id="talking-now-title">{t("talkingNow")}</SectionLabel>
      <p className="text-muted-foreground mt-2 text-sm">
        {t("talkingNowHint")}
      </p>
      <ul
        className={cn(
          "-mx-6 mt-4 flex gap-3 overflow-x-auto px-6 pb-1",
          "sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4",
        )}
      >
        {rooms.map((room) => (
          <RoomChip key={room.spaceId} room={room} />
        ))}
      </ul>
    </section>
  );
}
