"use client";

import { useTranslations } from "next-intl";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Handshake,
  Hash,
  House,
  Images,
  Lightbulb,
  MessageSquareText,
  NotebookPen,
  Repeat,
  Settings,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { HubMembershipSeed } from "@/server/better-auth/hub-session";
import {
  BUILTIN_SURFACES,
  resolveSpaceLabel,
} from "@/server/communities/space-defaults";
import { api } from "@/trpc/react";
import type { ShellDestination } from "@/components/shells/navigation";

const surfaceIcons = {
  forum: MessageSquareText,
  events: CalendarDays,
  gallery: Images,
  classroom: BookOpen,
  ideas: Lightbulb,
  members: Users,
  offers: CircleDollarSign,
  magazine: NotebookPen,
  matching: Handshake,
};

export function useCommunityNavigation({
  slug,
  memberRole,
  allowed = true,
  signedIn = true,
  redesign = false,
}: {
  slug: string;
  memberRole?: HubMembershipSeed["role"] | null;
  allowed?: boolean;
  signedIn?: boolean;
  redesign?: boolean;
}) {
  const t = useTranslations("communities.profile");
  const tRooms = useTranslations("communities.rooms");
  const shell = useTranslations("redesign.shell");
  const courses = useTranslations("redesign.classroom");
  const basePath = `/communities/${slug}`;
  const roomAccess = allowed && signedIn;
  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";
  const {
    data: spaceTabs,
    isError: spaceTabsError,
    isPending: spaceTabsPending,
    refetch: refetchSpaces,
  } = api.spaces.list.useQuery({ slug }, { enabled: allowed });
  const {
    data: roomTabs,
    isError: roomTabsError,
    isPending: roomTabsPending,
    refetch: refetchRooms,
  } = api.spaces.listRooms.useQuery({ slug }, { enabled: roomAccess });

  // The legacy tab bar keeps its default list when the spaces query fails.
  // The new frame only uses the verified list, also used by its page finder.
  const spaces: ShellDestination[] =
    spaceTabsError && !redesign
      ? BUILTIN_SURFACES.map((s) => ({ href: `${basePath}/${s}`, label: t(s) }))
      : (allowed && (!redesign || !spaceTabsError)
          ? (spaceTabs ?? [])
          : []
        ).flatMap((s) =>
          s.kind === "builtin" && s.builtinSurface
            ? [
                {
                  href: `${basePath}/${s.slug}`,
                  label:
                    redesign && s.builtinSurface === "classroom"
                      ? courses("courses")
                      : resolveSpaceLabel(s, t),
                  icon: surfaceIcons[s.builtinSurface],
                },
              ]
            : [],
        );
  const rooms = (
    roomAccess && (!redesign || !roomTabsError) ? (roomTabs ?? []) : []
  ).map((room) => ({
    id: room.id,
    membership: room.membership,
    href: `${basePath}/spaces/${room.slug}`,
    label: room.name ?? tRooms("untitled"),
    icon: Hash,
    locked: room.visibility === "private" && room.membership !== "active",
  }));

  const home = {
    href: basePath,
    label: redesign ? shell("home") : t("overview"),
    exact: true,
    icon: House,
  };
  const referrals =
    allowed && memberRole
      ? [
          {
            href: `${basePath}/referrals`,
            label: t("referrals"),
            icon: UserRoundPlus,
          },
        ]
      : [];
  const manage: ShellDestination[] = [
    ...(allowed && (isAdminOrOwner || memberRole === "moderator")
      ? [
          {
            href: `${basePath}/insights`,
            label: t("insights"),
            icon: ChartNoAxesColumnIncreasing,
          },
          { href: `${basePath}/rituals`, label: t("rituals"), icon: Repeat },
        ]
      : []),
    ...(allowed && isAdminOrOwner
      ? [{ href: `${basePath}/settings`, label: t("settings"), icon: Settings }]
      : []),
  ];

  return {
    home,
    spaces,
    rooms,
    referrals,
    manage,
    spacesPending: allowed && spaceTabsPending,
    roomsPending: roomAccess && roomTabsPending,
    spacesError: allowed && spaceTabsError,
    roomsError: roomAccess && roomTabsError,
    refetchSpaces,
    refetchRooms,
  };
}
