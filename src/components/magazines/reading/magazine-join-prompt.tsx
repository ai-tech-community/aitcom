"use client";

import type { JSX, ReactNode } from "react";
import { useTranslations } from "next-intl";

import { InviteResponse } from "@/components/communities/invite-response";
import {
  useCommunityJoin,
  useJoinDeepLink,
  type CommunityJoin,
} from "@/components/communities/use-community-join";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { JoinSource } from "@/lib/communities/join-source";
import type { JoinPolicy } from "@/server/communities/invite-policy";

export type JoinPromptCommunity = {
  slug: string;
  name: string;
  joinPolicy: JoinPolicy;
};
type Variant = "panel" | "inline";
type CopyKey =
  | "heading"
  | "panel"
  | "inline"
  | "join"
  | "request"
  | "pending"
  | "inviteOnly"
  | "visit";

/** Translation leaf keeps the presentational view free of hooks. */
function JoinCopy({
  message,
  community,
}: {
  message: CopyKey;
  community: string;
}) {
  const t = useTranslations("magazines.join");
  return t(message, { community });
}

/** Shared live/preview presentation: no state, effects or membership hooks. */
export function MagazineJoinPromptView({
  community,
  variant,
  action,
  onRun,
  busy,
  invite,
}: {
  community: JoinPromptCommunity;
  variant: Variant;
  action: CommunityJoin["action"];
  onRun: () => void;
  busy: boolean;
  invite?: ReactNode;
}): JSX.Element | null {
  const copy = (message: CopyKey) => (
    <JoinCopy message={message} community={community.name} />
  );
  const frame = (control: ReactNode) => (
    <div
      className={
        variant === "panel"
          ? "bg-background space-y-4 rounded-xl border p-6"
          : "space-y-3"
      }
    >
      {variant === "panel" ? (
        <>
          <h2 className="text-lg font-semibold text-balance">
            {copy("heading")}
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {copy("panel")}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm text-pretty">
          {copy("inline")}
        </p>
      )}
      {control}
    </div>
  );
  switch (action.kind) {
    case "join":
    case "request":
      return frame(
        <Button
          type="button"
          variant={variant === "panel" ? "default" : "outline"}
          className="h-auto min-h-11 max-w-full whitespace-normal"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onRun}
        >
          {copy(action.kind)}
        </Button>,
      );
    case "pending":
      return frame(<p className="text-sm text-pretty">{copy("pending")}</p>);
    case "invite_only":
      return frame(
        <div className="space-y-2 text-sm">
          <p className="text-pretty">{copy("inviteOnly")}</p>
          <Link
            href={`/communities/${community.slug}`}
            className="focus-visible:outline-ring rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {copy("visit")}
          </Link>
        </div>,
      );
    case "invited":
      return frame(invite);
    case "member":
    case "unavailable":
      return null;
  }
  const exhaustive: never = action;
  return exhaustive;
}

function FinishJoin({ onDone }: { onDone: () => void }) {
  useJoinDeepLink(onDone);
  return null;
}

/** Wires the shared join flow to the view and preserves focus on refresh. */
export function MagazineJoinPrompt({
  community,
  source,
  variant,
  focusTargetId,
}: {
  community: JoinPromptCommunity;
  source: JoinSource;
  variant: Variant;
  focusTargetId: string;
}): JSX.Element | null {
  const router = useRouter();
  const onChange = () => {
    document.getElementById(focusTargetId)?.focus();
    router.refresh();
  };
  const { action, run, busy } = useCommunityJoin({
    ...community,
    source,
    onChange,
  });
  return (
    <>
      {variant === "panel" && <FinishJoin onDone={onChange} />}
      <MagazineJoinPromptView
        community={community}
        variant={variant}
        action={action}
        onRun={() => void run()}
        busy={busy}
        invite={
          <InviteResponse
            slug={community.slug}
            name={community.name}
            variant={variant === "panel" ? "page" : "row"}
            onAnswered={onChange}
          />
        }
      />
    </>
  );
}
