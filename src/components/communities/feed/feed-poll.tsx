"use client";

import { useId, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { pollPercentages, type FeedPollView } from "@/lib/poll-rules";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

/**
 * A post's poll in the feed. A member who has not voted on an open poll
 * sees the answers as buttons; one tap votes. After voting, once the poll
 * has closed, or for someone who cannot vote, it shows the results: each
 * answer's share as a bar with its percentage and votes, the member's own
 * answer marked with a check and weight (not colour alone). A vote can be
 * taken back (and cast again) until the poll closes. Who voted for what is
 * never shown.
 */
export function FeedPoll({
  postId,
  poll,
  canVote,
}: {
  postId: number;
  poll: FeedPollView;
  /** An active member of the community (signed in). */
  canVote: boolean;
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

  const vote = api.feed.votePoll.useMutation({
    onSuccess: (next, input) => {
      if (!next) return;
      setVoted({ from: poll, view: next });
      setHeard(input.optionId === null ? t("voteTakenBack") : t("voteCounted"));
    },
    onError: (error) => {
      toast.error(
        error.data?.code === "BAD_REQUEST" ? error.message : t("voteFailed"),
      );
    },
  });

  const closed = view.closed || new Date(view.closesAt) <= now;
  const showResults = closed || !canVote || view.myVote !== null;
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
                    mine ? "bg-foreground/15" : "bg-muted",
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
          {view.options.map((option) => (
            <li key={option.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal"
                disabled={vote.isPending}
                onClick={() => vote.mutate({ postId, optionId: option.id })}
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
        {!closed && canVote && view.myVote !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-auto p-0 font-mono text-xs"
              disabled={vote.isPending}
              onClick={() => vote.mutate({ postId, optionId: null })}
            >
              {t("takeBack")}
            </Button>
          </>
        ) : null}
      </div>
      {/* Says the vote went through (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {heard}
      </p>
    </div>
  );
}
