"use client";

import { useId, useState } from "react";
import {
  ArrowUpRight,
  Lock,
  PanelRight,
  PanelsTopLeft,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ConversationView } from "@/components/messages/conversation-view";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { ChatAvatar } from "@/components/messages/chat-avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";
import { windowKey } from "@/components/communities/explore/space-window-reducer";
import { RoomMembersPanel } from "./room-members-panel";

type Room = RouterOutputs["spaces"]["getRoom"];

const detailsToggle =
  "border border-transparent aria-expanded:border-border aria-expanded:bg-secondary aria-expanded:text-foreground";

export const roomFrameHeight =
  "h-[calc(100dvh-5rem-var(--shell-bottom-offset)-1px)] min-h-80 lg:h-[calc(100dvh-6rem-1px)]";

function RoomDetails({
  room,
  slug,
  spaceSlug,
  inWindow,
}: {
  room: Room;
  slug: string;
  spaceSlug: string;
  inWindow: boolean;
}) {
  const t = useTranslations("redesign.chat");
  const rooms = useTranslations("communities.rooms");
  const { closeSpace, openSpace } = useSpaceWindows();
  const utils = api.useUtils();
  const windowRef = { communitySlug: slug, spaceSlug };
  const shownMembers = room.memberAvatars.filter(
    (member) => member.displayName,
  );

  return (
    <div className="flex flex-col items-start gap-5">
      {room.purpose ? (
        <div>
          <SectionLabel as="h3" bordered={false}>
            {t("aboutRoom")}
          </SectionLabel>
          <p
            dir="auto"
            className="text-muted-foreground mt-2 text-sm leading-relaxed wrap-anywhere"
          >
            {room.purpose}
          </p>
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold">
          {rooms("memberCount", { count: room.memberCount })}
        </h3>
        {shownMembers.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {shownMembers.map((member) => (
              <li key={member.userId} className="flex items-center gap-2.5">
                <ChatAvatar
                  name={member.displayName}
                  image={member.avatarUrl}
                />
                <span dir="auto" className="min-w-0 text-sm wrap-anywhere">
                  {member.displayName}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {room.memberCount > shownMembers.length ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("moreRoomMembers", {
              count: room.memberCount - shownMembers.length,
            })}
          </p>
        ) : null}
      </div>
      {room.viewerIsAdmin ? (
        <RoomMembersPanel
          slug={slug}
          spaceId={room.id}
          spaceSlug={spaceSlug}
          viewerIsAdmin={room.viewerIsAdmin}
          redesigned
        />
      ) : null}
      {inWindow ? (
        <Button asChild variant="outline" className="min-h-11 shadow-none">
          <Link
            href={`/communities/${slug}/spaces/${spaceSlug}`}
            onClick={() => closeSpace(windowKey(windowRef))}
          >
            <ArrowUpRight aria-hidden />
            {t("openRoom")}
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hidden min-h-11 md:inline-flex"
          onClick={() => {
            const community = utils.communities.getBySlug.getData({ slug });
            openSpace({
              ...windowRef,
              spaceName: room.name,
              communityName: community?.name ?? slug,
            });
          }}
        >
          <PanelsTopLeft aria-hidden />
          {t("openInWindow")}
        </Button>
      )}
    </div>
  );
}

export function RoomFrame({
  room,
  slug,
  spaceSlug,
  conversationId,
  inWindow,
}: {
  room: Room;
  slug: string;
  spaceSlug: string;
  conversationId: string;
  inWindow: boolean;
}) {
  const t = useTranslations("redesign.chat");
  const rooms = useTranslations("communities.rooms");
  const detailsId = useId();
  const [docked, setDocked] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  useInboxStream();

  const name = room.name ?? rooms("untitled");
  const Heading = inWindow ? "h2" : "h1";
  const isPrivate = room.visibility === "private";
  const details = (
    <RoomDetails
      room={room}
      slug={slug}
      spaceSlug={spaceSlug}
      inWindow={inWindow}
    />
  );

  return (
    <div
      data-chat-room=""
      className={cn(
        "bg-background flex min-w-0 flex-col",
        inWindow ? "h-full min-h-0" : `overflow-hidden ${roomFrameHeight}`,
      )}
    >
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-5">
        <ChatAvatar kind={isPrivate ? "private-room" : "room"} size="lg" />
        <div className="min-w-0 flex-1">
          <Heading
            dir="auto"
            className="truncate text-base leading-tight font-semibold sm:text-lg"
          >
            {name}
          </Heading>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs leading-tight">
            <span>{rooms(isPrivate ? "private" : "public")}</span>
            <span aria-hidden>·</span>
            <span>{rooms("memberCount", { count: room.memberCount })}</span>
          </p>
        </div>
        {!inWindow ? (
          <Button
            type="button"
            variant="ghost"
            className={cn(detailsToggle, "hidden min-h-11 xl:inline-flex")}
            aria-expanded={docked}
            aria-controls={detailsId}
            onClick={() => setDocked((show) => !show)}
          >
            <PanelRight aria-hidden />
            {t("details")}
          </Button>
        ) : null}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(detailsToggle, "size-11", !inWindow && "xl:hidden")}
              aria-label={t("details")}
              title={t("details")}
            >
              <PanelRight aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent
            showCloseButton={false}
            aria-describedby={undefined}
            className="w-[min(90vw,22rem)] gap-0 motion-reduce:animate-none"
          >
            <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-2">
              <SheetTitle>{t("details")}</SheetTitle>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={t("closeDetails")}
                >
                  <X aria-hidden />
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="min-h-0 overflow-y-auto p-5">{details}</div>
          </SheetContent>
        </Sheet>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            peer={{ name, image: null, isAgent: false }}
            hideHeader
            redesigned
            roomAuthors={{ slug, previews: room.memberAvatars }}
          />
        </div>
        {!inWindow ? (
          <aside
            id={detailsId}
            aria-label={t("details")}
            className={cn(
              "bg-muted/25 hidden w-62 shrink-0 overflow-y-auto border-l p-5",
              docked && "xl:block",
            )}
          >
            {docked ? details : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function RoomLobby({
  room,
  inWindow,
  publicJoin,
  privateRequest,
}: {
  room: Room;
  inWindow: boolean;
  publicJoin: { pending: boolean; run: () => void };
  privateRequest: { pending: boolean; run: () => void };
}) {
  const t = useTranslations("redesign.chat");
  const rooms = useTranslations("communities.rooms");
  const isPrivate = room.visibility === "private";
  const isPending = room.membership === "pending_request";
  const action = isPrivate ? privateRequest : publicJoin;
  const Heading = inWindow ? "h2" : "h1";

  return (
    <div
      data-chat-lobby=""
      className={cn(
        "bg-background flex items-start overflow-y-auto",
        inWindow ? "h-full" : roomFrameHeight,
      )}
    >
      <div className="mx-auto w-full max-w-lg px-6 py-10 sm:py-16">
        <ChatAvatar kind={isPrivate ? "private-room" : "room"} size="lg" />
        <Heading
          dir="auto"
          className="mt-4 text-2xl font-semibold tracking-tight wrap-anywhere"
        >
          {room.name ?? rooms("untitled")}
        </Heading>
        <p className="text-muted-foreground mt-1 text-sm">
          {rooms(isPrivate ? "private" : "public")} ·{" "}
          {rooms("memberCount", { count: room.memberCount })}
        </p>
        {room.purpose ? (
          <p dir="auto" className="mt-5 text-sm leading-relaxed wrap-anywhere">
            {room.purpose}
          </p>
        ) : null}
        <div className="mt-6 border-t pt-5">
          <p
            className="text-muted-foreground text-sm leading-relaxed"
            role={isPending ? "status" : undefined}
          >
            {isPending
              ? rooms("pending")
              : t(isPrivate ? "requestRoomHint" : "joinRoomHint")}
          </p>
          {!isPending ? (
            <Button
              className="mt-4 min-h-11"
              onClick={action.run}
              disabled={action.pending}
              aria-busy={action.pending}
            >
              {isPrivate ? <Lock aria-hidden /> : <Users aria-hidden />}
              {rooms(isPrivate ? "requestAccess.label" : "join.label")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
