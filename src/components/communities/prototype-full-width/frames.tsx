"use client";

// PROTOTYPE — throwaway. Community frames (identity + tabs + content area) for
// the full-width layout study. Variant A is the shipped layout and lives in
// _community-layout-client.tsx unchanged.

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Lock, Users } from "lucide-react";
import type { MembershipStatus as ViewerMembershipStatus } from "@/server/communities/invite-policy";
import type { RouterOutputs } from "@/trpc/react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CommunityHeader } from "../community-header";
import {
  CommunityNav,
  isCommunityNavItemActive,
  useCommunityNavItems,
} from "../community-nav";
import { JoinButton } from "../join-button";
import { MemberStack } from "../member-stack";
import { withVariant, type CommunityLayoutVariantKey } from "./variants";

type Community = RouterOutputs["communities"]["getBySlug"];
type MemberRole = "owner" | "admin" | "moderator" | "member" | null;

export interface FrameProps {
  community: Community;
  membershipStatus: ViewerMembershipStatus | null;
  memberRole: MemberRole;
  variant: CommunityLayoutVariantKey;
  children: React.ReactNode;
}

/** Full-width gutters shared with the top nav and the member dashboard. */
const WIDE_GUTTERS = "px-4 sm:px-8";

/* ------------------------------------------------------------------------ */
/* B — Identity rail: a sticky left panel holds who the community is and    */
/* every tab as a vertical list; the page gets the rest of the width.       */
/* ------------------------------------------------------------------------ */

export function IdentityRailFrame({
  community,
  membershipStatus,
  memberRole,
  variant,
  children,
}: FrameProps) {
  const t = useTranslations("communities.profile");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  const basePath = `/communities/${community.slug}`;
  const navItems = useCommunityNavItems({ slug: community.slug, memberRole });

  return (
    <div className="flex flex-col">
      {/* Below lg: the shipped header and tab bar. */}
      <div className="contents lg:hidden">
        <CommunityHeader
          community={community}
          membershipStatus={membershipStatus}
          memberRole={memberRole}
        />
        <CommunityNav slug={community.slug} memberRole={memberRole} />
      </div>

      <div
        className={cn(
          WIDE_GUTTERS,
          "py-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10 lg:py-8",
        )}
      >
        <aside className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-6 lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <div className="flex flex-col gap-3">
            <Avatar className="size-20 rounded-xl text-lg">
              {community.logoUrl ? (
                <AvatarImage src={community.logoUrl} alt={community.name} />
              ) : null}
              <AvatarFallback className="rounded-xl text-lg">
                {getInitials(community.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl font-semibold tracking-tight outline-none"
              >
                {community.name}
              </h1>
              {membershipStatus === "active" ? (
                <Badge variant="outline">{t("memberBadge")}</Badge>
              ) : null}
            </div>
            {community.description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {community.description}
              </p>
            ) : null}
            <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
              <Users className="size-3.5" />
              {community.memberCount} {t("members")}
            </div>
            <MemberStack slug={community.slug} />
            <div className="[&>*]:w-full">
              <JoinButton
                slug={community.slug}
                name={community.name}
                joinPolicy={community.joinPolicy}
                membershipStatus={membershipStatus}
                memberRole={memberRole}
                focusAfterAnswer={headingRef}
              />
            </div>
          </div>

          <nav
            aria-label="Community navigation"
            className="flex flex-col border-t pt-4"
          >
            {navItems.map((item) => {
              const active = isCommunityNavItemActive(item, pathname, basePath);
              return (
                <Link
                  key={item.key}
                  href={withVariant(item.href, variant) as never}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.isPrivate ? (
                    <Lock
                      className="text-muted-foreground ml-1 inline-block size-3"
                      aria-label="private room"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* C — Wide frame, top tabs: one compact identity row and the tab bar run   */
/* edge to edge on the top nav's gutters (the member-dashboard frame).      */
/* ------------------------------------------------------------------------ */

export function WideTabsFrame({
  community,
  membershipStatus,
  memberRole,
  variant,
  children,
}: FrameProps) {
  const t = useTranslations("communities.profile");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  const basePath = `/communities/${community.slug}`;
  const navItems = useCommunityNavItems({ slug: community.slug, memberRole });

  return (
    <div className="flex flex-col">
      <div className="border-b">
        <div
          className={cn(
            WIDE_GUTTERS,
            "flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 shrink-0 rounded-xl">
              {community.logoUrl ? (
                <AvatarImage src={community.logoUrl} alt={community.name} />
              ) : null}
              <AvatarFallback className="rounded-xl">
                {getInitials(community.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-tight outline-none sm:text-2xl"
                >
                  {community.name}
                </h1>
                {membershipStatus === "active" ? (
                  <Badge variant="outline">{t("memberBadge")}</Badge>
                ) : null}
              </div>
              {community.description ? (
                <p className="text-muted-foreground line-clamp-1 max-w-3xl text-sm">
                  {community.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="hidden items-center gap-3 md:flex">
              <MemberStack slug={community.slug} />
              <span className="text-muted-foreground font-mono text-xs">
                {community.memberCount} {t("members")}
              </span>
            </div>
            <JoinButton
              slug={community.slug}
              name={community.name}
              joinPolicy={community.joinPolicy}
              membershipStatus={membershipStatus}
              memberRole={memberRole}
              focusAfterAnswer={headingRef}
            />
          </div>
        </div>
      </div>

      <div className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-12 z-40 border-b backdrop-blur">
        <nav
          aria-label="Community navigation"
          className={cn(WIDE_GUTTERS, "-mb-px flex gap-1 overflow-x-auto")}
        >
          {navItems.map((item) => {
            const active = isCommunityNavItemActive(item, pathname, basePath);
            return (
              <Link
                key={item.key}
                href={withVariant(item.href, variant) as never}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
                )}
              >
                {item.label}
                {item.isPrivate ? (
                  <Lock
                    className="text-muted-foreground ml-1 inline-block size-3"
                    aria-label="private room"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn(WIDE_GUTTERS, "w-full py-6 lg:py-8")}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* D — Feed + board: a fuller identity band in a wide 1600px frame (the     */
/* Explore frame), tabs underneath; the overview becomes feed + board.      */
/* ------------------------------------------------------------------------ */

const BOARD_FRAME = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";

export function BoardFrame({
  community,
  membershipStatus,
  memberRole,
  variant,
  children,
}: FrameProps) {
  const t = useTranslations("communities.profile");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  const basePath = `/communities/${community.slug}`;
  const navItems = useCommunityNavItems({ slug: community.slug, memberRole });
  const active = community.liveness?.activeContributors ?? 0;

  return (
    <div className="flex flex-col">
      <div className="bg-sidebar border-b">
        <div
          className={cn(
            BOARD_FRAME,
            "grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
          )}
        >
          <div className="flex items-start gap-5">
            <Avatar className="size-20 shrink-0 rounded-2xl text-xl lg:size-24">
              {community.logoUrl ? (
                <AvatarImage src={community.logoUrl} alt={community.name} />
              ) : null}
              <AvatarFallback className="rounded-2xl text-xl">
                {getInitials(community.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-3xl font-semibold tracking-tight outline-none lg:text-4xl"
                >
                  {community.name}
                </h1>
                {membershipStatus === "active" ? (
                  <Badge variant="outline">{t("memberBadge")}</Badge>
                ) : null}
              </div>
              {community.description ? (
                <p className="text-muted-foreground max-w-3xl text-base leading-relaxed">
                  {community.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 lg:justify-end">
            <dl className="flex gap-6 font-mono text-xs">
              <div>
                <dt className="text-muted-foreground uppercase">
                  {t("members")}
                </dt>
                <dd className="text-foreground text-lg font-semibold">
                  {community.memberCount}
                </dd>
              </div>
              {active > 0 ? (
                <div>
                  <dt className="text-muted-foreground uppercase">
                    Active / week
                  </dt>
                  <dd className="text-foreground text-lg font-semibold">
                    {active}
                  </dd>
                </div>
              ) : null}
            </dl>
            <MemberStack slug={community.slug} />
            <JoinButton
              slug={community.slug}
              name={community.name}
              joinPolicy={community.joinPolicy}
              membershipStatus={membershipStatus}
              memberRole={memberRole}
              focusAfterAnswer={headingRef}
            />
          </div>
        </div>
      </div>

      <div className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-12 z-40 border-b backdrop-blur">
        <nav
          aria-label="Community navigation"
          className={cn(BOARD_FRAME, "-mb-px flex gap-1 overflow-x-auto")}
        >
          {navItems.map((item) => {
            const isActive = isCommunityNavItemActive(item, pathname, basePath);
            return (
              <Link
                key={item.key}
                href={withVariant(item.href, variant) as never}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn(BOARD_FRAME, "py-6 lg:py-8")}>{children}</div>
    </div>
  );
}
