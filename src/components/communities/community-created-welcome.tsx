"use client";

import { useId, type Ref } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { DEFAULT_COMMUNITY_THEME_ID } from "@/lib/communities/themes";
import { cn } from "@/lib/utils";
import { isPublicCommunity } from "@/server/communities/content-visibility";
import { api, type RouterOutputs } from "@/trpc/react";
import { CommunityBanner } from "./community-banner";
import { CommunityCoverArt } from "./theme/community-cover-art";
import { CommunitySetupSharing } from "./community-setup-sharing";
import { SetupStepStatus } from "./community-setup-step-status";
import { communityPublicUrl } from "./create-community-link";
import type { PostComposerDisclosure } from "./feed/post-composer";

type Community = RouterOutputs["communities"]["getBySlug"];
const setupLink =
  "inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const stepAction =
  "flex h-auto min-h-11 w-full justify-start gap-2.5 rounded-none px-4 py-3 text-start whitespace-normal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground focus-visible:ring-0 motion-reduce:transition-none sm:px-6";

/** A first-week path for the owner, derived from the current community and feed. */
export function CommunityCreatedWelcome({
  community,
  disclosure,
  showCover,
}: {
  community: Community;
  disclosure: PostComposerDisclosure;
  showCover: boolean;
}) {
  const t = useTranslations("redesign.creation.welcome");
  const tCreation = useTranslations("redesign.creation");
  const { slug } = community;
  const posts = api.feed.getFeed.useQuery({ communitySlug: slug, limit: 1 });
  const hasPost = Boolean(posts.data?.posts.length);
  const hasMembers = (community.memberCount ?? 0) > 1;
  const hasLook =
    community.themeId !== DEFAULT_COMMUNITY_THEME_ID ||
    Boolean(community.bannerUrl);
  const complete = Number(hasPost) + Number(hasMembers) + Number(hasLook);
  const visibility = isPublicCommunity(community)
    ? t("publicAccess")
    : t(community.isListedInDirectory ? "listedAccess" : "unlistedAccess", {
        joining: tCreation(`joining.${community.joinPolicy}`),
      });
  const basePath = `/communities/${slug}` as const;
  const publicUrl = communityPublicUrl(basePath);
  const { editor, editorId, expanded, onToggle, toggleDisabled, triggerRef } =
    disclosure;

  return (
    <section
      aria-labelledby="community-created-title"
      data-community-first-week=""
      className="space-y-3 pb-4 sm:space-y-6 sm:pb-6"
    >
      <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-8">
        <div className="min-w-0">
          <h2
            id="community-created-title"
            className="font-community-heading text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed sm:text-base">
            {visibility}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 text-sm">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={setupLink}
            >
              {t("viewVisitor")}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <Link href={`${basePath}/settings/general`} className={setupLink}>
              {t("editVisibility")}
            </Link>
          </div>
        </div>
        {showCover &&
          (community.bannerUrl ? (
            <CommunityBanner
              community={community}
              className="h-24 w-20 shrink-0 sm:h-32 sm:w-48 lg:h-32 lg:w-60"
            />
          ) : hasLook ? (
            <CommunityCoverArt
              themeId={community.themeId}
              className="h-24 w-20 shrink-0 rounded-lg border sm:h-32 sm:w-48 lg:w-60"
            />
          ) : null)}
      </div>

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-2 sm:px-6">
          <SectionLabel as="h3" bordered={false}>
            {t("firstWeek")}
          </SectionLabel>
          {posts.isPending ? (
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
          ) : posts.data ? (
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              role="status"
            >
              {t("progress", { complete })}
            </span>
          ) : null}
        </div>
        <ol className="divide-y">
          <li>
            <SetupStep
              title={t("postTitle")}
              actionLabel={t(expanded ? "hideEditor" : "writePost")}
              detail={t(hasPost ? "nextPostHelp" : "postHelp")}
              done={posts.data ? hasPost : undefined}
              primary={!hasPost && !expanded}
              controls={editorId}
              expanded={expanded}
              onToggle={onToggle}
              disabled={toggleDisabled}
              buttonRef={triggerRef}
            />
            <div hidden={!expanded} className="px-4 pb-4 sm:px-6">
              {editor}
            </div>
          </li>
          <CommunitySetupSharing community={community} done={hasMembers} />
          <li>
            <SetupStep
              title={t("lookStep")}
              actionLabel={t("chooseLook")}
              detail={t("lookHelp")}
              done={hasLook}
              href={`${basePath}/settings/themes`}
            />
          </li>
          <li>
            <SetupStep
              title={t("eventStep")}
              actionLabel={t("createEvent")}
              detail={t("eventHelp")}
              optional
              href={`${basePath}/events/new`}
            />
          </li>
        </ol>
        {posts.isError && !posts.data && (
          <div className="border-t px-4 py-2 sm:px-6">
            <ErrorState
              title={t("progressError")}
              className="py-4 [&_button]:min-h-11"
              onRetry={() => void posts.refetch()}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function SetupStep({
  title,
  detail,
  done,
  href,
  controls,
  expanded,
  onToggle,
  disabled,
  buttonRef,
  actionLabel,
  primary = false,
  optional = false,
}: {
  title: string;
  actionLabel: string;
  detail: string;
  done?: boolean;
  primary?: boolean;
  optional?: boolean;
} & (
  | {
      href: string;
      controls?: never;
      expanded?: never;
      onToggle?: never;
      disabled?: never;
      buttonRef?: never;
    }
  | {
      href?: never;
      controls: string;
      expanded: boolean;
      onToggle: () => void;
      disabled: boolean;
      buttonRef: Ref<HTMLButtonElement>;
    }
)) {
  const titleId = useId();
  const detailId = useId();
  const completionId = `${detailId}-complete`;
  const actionId = `${titleId}-action`;
  const describedBy = [done ? completionId : null, titleId, detailId]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {optional ? (
        <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
          <CalendarDays className="size-4" aria-hidden="true" />
        </span>
      ) : (
        <SetupStepStatus done={done} completionId={completionId} />
      )}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-sm md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:items-center md:gap-3">
        <span id={titleId} className="font-medium">
          {title}
        </span>
        <span
          id={detailId}
          className="text-muted-foreground leading-snug font-normal"
        >
          {detail}
        </span>
      </span>
      <span
        id={actionId}
        className={cn(
          "inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2.5",
          primary
            ? "bg-primary text-foreground dark:text-background"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {actionLabel}
        {href !== undefined && (
          <ArrowRight className="size-3.5" aria-hidden="true" />
        )}
      </span>
    </>
  );
  return href !== undefined ? (
    <Button
      asChild
      variant="ghost"
      className={stepAction}
      aria-labelledby={actionId}
      aria-describedby={describedBy}
    >
      <Link href={href}>{content}</Link>
    </Button>
  ) : (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      aria-controls={controls}
      aria-expanded={expanded}
      disabled={disabled}
      aria-labelledby={actionId}
      aria-describedby={describedBy}
      className={stepAction}
      onClick={onToggle}
    >
      {content}
    </Button>
  );
}
