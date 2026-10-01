"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { pollPercentages, type FeedPollView } from "@/lib/poll-rules";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

/**
 * A post's poll in the feed. A member who has not voted on an open poll
 * sees the answers as buttons; one tap votes. A visitor sees the same
 * buttons, which ask them to sign in first; a signed-in non-member sees the
 * results with a note that joining lets them vote. After voting, or once
 * the poll has closed, it shows the results: each answer's share as a bar
 * with its percentage and votes, the member's own answer marked with a
 * check and weight (not colour alone). A vote can be taken back (and cast
 * again) until the poll closes; keyboard focus moves to what comes next.
 * Who voted for what is never shown.
 */
export function FeedPoll({
  postId,
  poll,
  viewer,
}: {
  postId: number;
  poll: FeedPollView;
  /** A member may vote; a guest is asked to sign in; an outsider to join. */
  viewer: "member" | "guest" | "outsider";
}) {
  const t = useTranslations("communities.feed.poll");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const groupId = useId();
  // The counts after this member's vote, until the feed brings a fresher
  // copy of the poll (a refetch), which then wins.
  const [voted, setVoted] = useState<{
    from: FeedPollView;
    view: FeedPollView;
  } | null>(null);
  const view = voted?.from === poll ? voted.view : poll;
  const [heard, setHeard] = useState("");
  const { requireAuth } = useRequireAuth();
  const utils = api.useUtils();
  const takeBackButton = useRef<HTMLButtonElement>(null);
  const firstAnswer = useRef<HTMLButtonElement>(null);
  // The control that replaces the one just pressed takes the focus.
  const focusAfter = useRef<"takeBack" | "answers" | null>(null);

  const vote = api.feed.votePoll.useMutation({
    onSuccess: (next, input) => {
      if (!next) return;
      setVoted({ from: poll, view: next });
      setHeard(input.optionId === null ? t("voteTakenBack") : t("voteCounted"));
      focusAfter.current = input.optionId === null ? "answers" : "takeBack";
      // Other copies of this post (pinned, the activity list) catch up.
      void utils.feed.getFeed.invalidate();
      void utils.feed.getActivity.invalidate();
    },
    onError: (error) => {
      toast.error(
        error.data?.code === "BAD_REQUEST" || error.data?.code === "CONFLICT"
          ? error.message
          : t("voteFailed"),
      );
    },
  });

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    (target === "takeBack" ? takeBackButton : firstAnswer).current?.focus();
  });

  const closed = view.closed || new Date(view.closesAt) <= now;
  const showResults = closed || viewer === "outsider" || view.myVote !== null;
  const cast = (optionId: string) =>
    requireAuth(() => vote.mutate({ postId, optionId }), t("signInToVote"));
  const shares = pollPercentages(view.options.map((option) => option.votes));

  return (
    <div
      role="group"
      aria-labelledby={`${groupId}-label`}
      className="space-y-2"
    >
      <p id={`${groupId}-label`} className="sr-only">
        {t("label")}
      </p>
      {showResults ? (
        <ul className="space-y-1.5">
          {view.options.map((option, index) => {
            const mine = option.id === view.myVote;
            return (
              <li
                key={option.id}
                className="border-border relative overflow-hidden rounded-md border"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-0 left-0 transition-[width] motion-reduce:transition-none",
                    mine ? "bg-foreground/15" : "bg-foreground/[0.07]",
                  )}
                  style={{ width: `${shares[index]}%` }}
                />
                <span className="relative flex items-center gap-2 px-3 py-2 text-sm">
                  <span
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1.5",
                      mine && "font-medium",
                    )}
                  >
                    <span className="min-w-0 break-words">{option.label}</span>
                    {mine ? (
                      <>
                        <Check aria-hidden="true" className="size-4 shrink-0" />
                        <span className="sr-only">{t("yourVote")}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {shares[index]}%
                    <span className="sr-only">
                      {", "}
                      {t("votes", { count: option.votes })}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {view.options.map((option, index) => (
            <li key={option.id}>
              <Button
                ref={index === 0 ? firstAnswer : undefined}
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal"
                disabled={vote.isPending}
                onClick={() => cast(option.id)}
              >
                {option.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
        <span>{t("votes", { count: view.totalVotes })}</span>
        <span aria-hidden="true">·</span>
        <span suppressHydrationWarning>
          {closed
            ? t("finalResults")
            : t("closes", {
                when: format.relativeTime(new Date(view.closesAt), now),
              })}
        </span>
      </div>
      {!closed && viewer === "member" && view.myVote !== null ? (
        <Button
          ref={takeBackButton}
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          disabled={vote.isPending}
          onClick={() => vote.mutate({ postId, optionId: null })}
        >
          {t("takeBack")}
        </Button>
      ) : null}
      {!closed && viewer === "outsider" ? (
        <p className="text-muted-foreground text-xs">{t("joinToVote")}</p>
      ) : null}
      {/* Says the vote went through (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {heard}
      </p>
    </div>
  );
}
