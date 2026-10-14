"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import {
  applyStorylineVote,
  type StorylineVoteChoice,
} from "@/lib/news/storyline-vote";
import { api } from "@/trpc/react";

export function StorylineVoteControls({
  storyId,
  score: initialScore,
  myVote: initialVote,
}: {
  storyId: string;
  score: number;
  myVote: StorylineVoteChoice | null;
}) {
  const t = useTranslations("newsStories.votes");
  const { promptAuth, authStatus } = useRequireAuth();
  const [score, setScore] = useState(initialScore);
  const [myVote, setMyVote] = useState(initialVote);
  const propsRef = useRef({ storyId, initialScore, initialVote });
  if (
    propsRef.current.storyId !== storyId ||
    propsRef.current.initialScore !== initialScore ||
    propsRef.current.initialVote !== initialVote
  ) {
    propsRef.current = { storyId, initialScore, initialVote };
    setScore(initialScore);
    setMyVote(initialVote);
  }
  const cast = api.news.castStorylineVote.useMutation();
  const signedIn = authStatus === "authenticated";
  const ready = signedIn || authStatus === "guest";

  const commit = (next: StorylineVoteChoice | null) => {
    const previous = { score, myVote };
    const optimistic = applyStorylineVote(previous, next);
    setScore(optimistic.score);
    setMyVote(optimistic.myVote);
    cast.mutate(
      { storyId, vote: next ?? "clear" },
      {
        onSuccess: (result) => {
          setScore(result.score);
          setMyVote(result.myVote);
        },
        onError: (error) => {
          setScore(previous.score);
          setMyVote(previous.myVote);
          if (error.data?.code === "UNAUTHORIZED") {
            promptAuth(t("signInToVote"));
            return;
          }
          toast.error(t("voteFailed"));
        },
      },
    );
  };

  const choose = (choice: StorylineVoteChoice) => {
    if (!signedIn) {
      if (authStatus === "guest") promptAuth(t("signInToVote"));
      return;
    }
    commit(myVote === choice ? null : choice);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      <span
        className="text-muted-foreground min-w-6 font-mono text-xs tabular-nums"
        aria-live="polite"
      >
        <span className="sr-only">{t("scoreLabel")} </span>
        {score}
      </span>
      <Button
        type="button"
        size="sm"
        variant={myVote === "up" ? "secondary" : "outline"}
        aria-pressed={myVote === "up"}
        disabled={!ready || cast.isPending}
        onClick={() => choose("up")}
      >
        {t("voteUp")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={myVote === "down" ? "secondary" : "outline"}
        aria-pressed={myVote === "down"}
        disabled={!ready || cast.isPending}
        onClick={() => choose("down")}
      >
        {t("voteDown")}
      </Button>
      {myVote ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!ready || cast.isPending}
          onClick={() => (signedIn ? commit(null) : undefined)}
        >
          {t("removeVote")}
        </Button>
      ) : null}
    </div>
  );
}
