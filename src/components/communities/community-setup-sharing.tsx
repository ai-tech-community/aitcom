"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { communityPublicUrl } from "./create-community-link";
import {
  CommunitySetupCopyButton,
  setupOutlineAction,
} from "./community-setup-copy-button";
import { SetupStepStatus } from "./community-setup-step-status";
import {
  communityInvitePath,
  isExpiredInvite,
  isMaxedOutInvite,
} from "./settings/invite-links";

type Community = RouterOutputs["communities"]["getBySlug"];
const endAction = "col-start-2 row-start-1 justify-self-end";
const linkRow =
  "grid grid-cols-[minmax(0,1fr)_fit-content(55%)] content-start items-center gap-x-2 gap-y-1 py-1";
const linkValue =
  "text-muted-foreground col-span-full row-start-2 min-w-0 text-xs leading-snug wrap-anywhere sm:text-sm";

export function CommunitySetupSharing({
  community,
  done,
}: {
  community: Pick<Community, "slug" | "joinPolicy">;
  done: boolean;
}) {
  const t = useTranslations("redesign.creation.welcome");
  const id = useId();
  const { slug, joinPolicy } = community;
  const publicUrl = communityPublicUrl(`/communities/${slug}`);
  const inviteOnly = joinPolicy === "invite_only";
  const invites = api.communities.getInviteLinks.useQuery(
    { slug },
    { enabled: inviteOnly },
  );
  const shareable = invites.data?.find(
    (invite) =>
      !invite.targetEmail &&
      (!invite.role || invite.role === "member") &&
      !isExpiredInvite(invite.expiresAt) &&
      !isMaxedOutInvite(invite.useCount, invite.maxUses),
  );
  const token = inviteOnly ? shareable?.code : slug;
  const href = token ? communityPublicUrl(communityInvitePath(token)) : null;

  const publicRow = (
    <div className={linkRow}>
      <dt className="text-sm font-medium">{t("publicAddress")}</dt>
      <dd className="contents">
        <p className={linkValue} dir="ltr">
          {publicUrl}
        </p>
        <CommunitySetupCopyButton
          href={publicUrl}
          label={t("copyAddress")}
          inputLabel={t("publicAddress")}
          copied={t("addressCopied")}
          copyError={t("addressCopyError")}
          className={endAction}
          secondary={inviteOnly}
        />
      </dd>
    </div>
  );
  const inviteRow = (
    <div className={linkRow}>
      <dt className="text-sm font-medium">{t("inviteLink")}</dt>
      <dd className="contents">
        {href && (
          <p className={linkValue} dir="ltr">
            {href}
          </p>
        )}
        {href ? (
          <CommunitySetupCopyButton
            href={href}
            label={t("copyInvite")}
            inputLabel={t("inviteLink")}
            copied={t("inviteCopied")}
            copyError={t("inviteCopyError")}
            className={endAction}
            secondary={!inviteOnly}
          />
        ) : invites.isPending ? (
          <Skeleton
            className={cn(
              "h-11 w-36 max-w-full motion-reduce:animate-none",
              endAction,
            )}
          />
        ) : (
          <Button
            asChild
            variant="outline"
            className={cn(setupOutlineAction, endAction)}
          >
            <Link href={`/communities/${slug}/settings/invites`}>
              {t(invites.isError ? "openInvites" : "createInvite")}
            </Link>
          </Button>
        )}
        {!inviteOnly && (
          <p className="text-muted-foreground col-span-full text-xs leading-snug">
            {t(
              joinPolicy === "approval_required"
                ? "sharingApproval"
                : "sharingInviteUse",
            )}
          </p>
        )}
      </dd>
    </div>
  );

  return (
    <li className="px-4 py-3 sm:px-6">
      <div
        role="group"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
      >
        <div className="flex items-start gap-2.5">
          <SetupStepStatus done={done} />
          <div>
            <p id={`${id}-title`} className="text-sm font-medium">
              {t("shareStep")}
            </p>
            <p
              id={`${id}-help`}
              className="text-muted-foreground mt-0.5 text-sm leading-snug"
            >
              {t(inviteOnly ? "sharingInviteFirst" : "sharingPublic")}
            </p>
          </div>
        </div>
        <dl className="mt-2 grid gap-x-6 divide-y sm:ml-7 sm:grid-cols-2 sm:divide-y-0">
          {inviteOnly ? (
            <>
              {inviteRow}
              {publicRow}
            </>
          ) : (
            <>
              {publicRow}
              {inviteRow}
            </>
          )}
        </dl>
      </div>
    </li>
  );
}
