"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  communityHref,
  communityMemberSettingsHref,
} from "@/lib/communities/routes";
import type { RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";

export type NextUpItem = RouterOutputs["home"]["nextUp"]["items"][number];

type ItemOf<K extends NextUpItem["kind"]> = Extract<NextUpItem, { kind: K }>;

/** Where the member acts on each kind. Locale-less; `Link` adds the locale. */
export const nextUpHref = {
  event: (slug: string) => `/events/${slug}`,
  challenge: (slug: string) => `/challenges/${slug}`,
  community: communityHref,
  communityMemberSettings: communityMemberSettingsHref,
  notifications: "/dashboard/notifications",
  inbox: "/messages",
} as const;

type RowLayoutProps = {
  /** The human sentence: what is next, in Geist Sans. */
  sentence: React.ReactNode;
  /**
   * The line under the sentence, in Geist Sans. Timestamps inside it
   * (`RelativeTime`) carry their own Geist Mono; words stay sans.
   */
  meta?: React.ReactNode;
  href: string;
  action: string;
  /** The single most urgent row's action is the screen's one orange. */
  primary: boolean;
};

/** The shape every kind shares: sentence and meta, one action on the right. */
function RowLayout({ sentence, meta, href, action, primary }: RowLayoutProps) {
  const sentenceId = React.useId();
  return (
    <li
      data-slot="next-up-row"
      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0 flex-1">
        <p id={sentenceId} className="text-sm font-medium text-pretty">
          {sentence}
        </p>
        {meta && (
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {meta}
          </p>
        )}
      </div>
      <Button
        asChild
        size="sm"
        variant={primary ? "default" : "outline"}
        className="w-fit shrink-0"
      >
        <Link href={href} aria-describedby={sentenceId}>
          {action}
        </Link>
      </Button>
    </li>
  );
}

type RowProps<K extends NextUpItem["kind"]> = {
  item: ItemOf<K>;
  primary: boolean;
};

/**
 * An event the member is going to. One that is already running says so and
 * shows when it ends, instead of a start time in the past.
 */
function EventRow({ item, primary }: RowProps<"event">) {
  const t = useTranslations("dashboard.nextUp.event");
  const { endsAt } = item;
  let sentence: string;
  let meta: React.ReactNode;
  if (!item.happeningNow) {
    sentence = t(item.registration, { title: item.title });
    meta = <RelativeTime date={item.startsAt} />;
  } else if (item.allDay) {
    sentence = t("today", { title: item.title });
  } else {
    sentence = t("happeningNow", { title: item.title });
    meta = endsAt
      ? t.rich("ends", { time: () => <RelativeTime date={endsAt} /> })
      : undefined;
  }
  return (
    <RowLayout
      sentence={sentence}
      meta={meta}
      href={nextUpHref.event(item.slug)}
      action={t("action")}
      primary={primary}
    />
  );
}

function ChallengeRow({ item, primary }: RowProps<"challenge">) {
  const t = useTranslations("dashboard.nextUp.challenge");
  const endsAt = item.endsAt;
  return (
    <RowLayout
      sentence={t("sentence", { title: item.title })}
      meta={
        endsAt
          ? t.rich("deadline", { time: () => <RelativeTime date={endsAt} /> })
          : t("openEnded")
      }
      href={nextUpHref.challenge(item.slug)}
      action={t("action")}
      primary={primary}
    />
  );
}

function InviteRow({ item, primary }: RowProps<"invite">) {
  const t = useTranslations("dashboard.nextUp.invite");
  return (
    <RowLayout
      sentence={t("sentence", { name: item.name })}
      href={nextUpHref.community(item.slug)}
      action={t("action")}
      primary={primary}
    />
  );
}

function JoinRequestsRow({ item, primary }: RowProps<"joinRequests">) {
  const t = useTranslations("dashboard.nextUp.joinRequests");
  return (
    <RowLayout
      sentence={t("sentence", { count: item.count, name: item.name })}
      href={nextUpHref.communityMemberSettings(item.slug)}
      action={t("action")}
      primary={primary}
    />
  );
}

/**
 * Notifications and messages in one line. The one action goes to
 * notifications while any are unread (messages also have the inbox badge in
 * the top bar), otherwise to the inbox.
 */
function UnreadRow({ item, primary }: RowProps<"unread">) {
  const t = useTranslations("dashboard.nextUp.unread");
  const { notifications, messages } = item;
  const sentence =
    notifications > 0 && messages > 0
      ? t("both", { notifications, messages })
      : notifications > 0
        ? t("notifications", { count: notifications })
        : t("messages", { count: messages });
  return (
    <RowLayout
      sentence={sentence}
      href={notifications > 0 ? nextUpHref.notifications : nextUpHref.inbox}
      action={
        notifications > 0 ? t("notificationsAction") : t("messagesAction")
      }
      primary={primary}
    />
  );
}

/** One Next up row, rendered by kind. */
export function NextUpRow({
  item,
  primary,
}: {
  item: NextUpItem;
  primary: boolean;
}) {
  switch (item.kind) {
    case "event":
      return <EventRow item={item} primary={primary} />;
    case "challenge":
      return <ChallengeRow item={item} primary={primary} />;
    case "invite":
      return <InviteRow item={item} primary={primary} />;
    case "joinRequests":
      return <JoinRequestsRow item={item} primary={primary} />;
    case "unread":
      return <UnreadRow item={item} primary={primary} />;
    default: {
      // A new kind fails the build here until it has a row.
      const unhandled: never = item;
      void unhandled;
      return null;
    }
  }
}
