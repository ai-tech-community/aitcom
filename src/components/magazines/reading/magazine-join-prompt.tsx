"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { InviteResponseView } from "@/components/communities/invite-response";
import {
  useCommunityJoin,
  useJoinDeepLink,
  useInviteResponse,
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
  tone = "live",
}: {
  community: JoinPromptCommunity;
  variant: Variant;
  action: CommunityJoin["action"];
  onRun: () => void;
  busy: boolean;
  invite?: ReactNode;
  tone?: "live" | "preview";
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
          variant={
            variant === "panel" && tone === "live" ? "default" : "outline"
          }
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

type PromptScope = {
  community: JoinPromptCommunity;
  source: JoinSource;
  focusTargetId: string;
};

type PromptState = Pick<CommunityJoin, "action" | "run" | "busy"> & {
  invite: ReturnType<typeof useInviteResponse>;
};

const JoinPromptContext = createContext<PromptState | null>(null);

/** One join state and sign-in completion for every prompt on an issue page. */
export function MagazineJoinPromptProvider({
  community,
  source,
  focusTargetId,
  children,
  finishJoin = true,
}: PromptScope & { children: ReactNode; finishJoin?: boolean }) {
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
  const invite = useInviteResponse({ ...community, onChange });
  return (
    <JoinPromptContext.Provider value={{ action, run, busy, invite }}>
      {finishJoin && <FinishJoin onDone={onChange} />}
      {children}
    </JoinPromptContext.Provider>
  );
}

function ConnectedJoinPrompt({
  community,
  variant,
  state,
}: {
  community: JoinPromptCommunity;
  variant: Variant;
  state: PromptState;
}) {
  const { action, run, busy, invite } = state;
  return (
    <MagazineJoinPromptView
      community={community}
      variant={variant}
      action={action}
      onRun={() => void run()}
      busy={busy}
      invite={
        <InviteResponseView
          name={community.name}
          variant={variant === "panel" ? "page" : "row"}
          response={invite}
        />
      }
    />
  );
}

/** Shares the page's join state, or supplies it for a standalone article. */
export function MagazineJoinPrompt(
  props: PromptScope & { variant: Variant },
): JSX.Element | null {
  const state = useContext(JoinPromptContext);
  if (state)
    return (
      <ConnectedJoinPrompt
        community={props.community}
        variant={props.variant}
        state={state}
      />
    );
  return (
    <MagazineJoinPromptProvider
      {...props}
      finishJoin={props.variant === "panel"}
    >
      <MagazineJoinPrompt {...props} />
    </MagazineJoinPromptProvider>
  );
}
