"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ChevronDown, ChevronUp } from "lucide-react";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import {
  applyStorylineVote,
  type StorylineVoteChoice,
} from "@/lib/news/storyline-vote";
import { cn } from "@/lib/utils";
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
    <div
      className="flex w-10 shrink-0 flex-col items-center"
      role="group"
      aria-label={t("scoreLabel")}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-pressed={myVote === "up"}
        aria-label={t("voteUp")}
        disabled={!ready || cast.isPending}
        className={cn(
          "text-muted-foreground",
          myVote === "up" &&
            "bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary",
        )}
        onClick={() => choose("up")}
      >
        <ChevronUp
          className={cn("size-5", myVote === "up" && "fill-current")}
          aria-hidden
        />
      </Button>
      <span
        className="text-foreground py-0.5 font-mono text-sm tabular-nums"
        aria-live="polite"
      >
        <span className="sr-only">{t("scoreLabel")} </span>
        {score}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-pressed={myVote === "down"}
        aria-label={t("voteDown")}
        disabled={!ready || cast.isPending}
        className={cn(
          "text-muted-foreground",
          myVote === "down" &&
            "bg-info/15 text-info hover:bg-info/15 hover:text-info",
        )}
        onClick={() => choose("down")}
      >
        <ChevronDown
          className={cn("size-5", myVote === "down" && "fill-current")}
          aria-hidden
        />
      </Button>
    </div>
  );
}
