"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { WeeklyTopic } from "@/lib/news/weekly-topics";

import { StorylineContributions } from "./storyline-contributions";
import { StorySuggestionBox } from "./story-suggestion-box";
import { WeeklyTopicClaims } from "./weekly-topic-claims";

export function ContributeDesk({ topics }: { topics: WeeklyTopic[] }) {
  const t = useTranslations("newsStories.contribute");
  const [seed, setSeed] = useState<{ title: string; token: number } | null>(
    null,
  );

  const placeTopic = (title: string) => {
    setSeed((current) => ({
      title,
      token: (current?.token ?? 0) + 1,
    }));
    toast.success(t("topicApplied", { title }));
  };

  return (
    <>
      <WeeklyTopicClaims topics={topics} onTopicPlaced={placeTopic} />
      <StorySuggestionBox />
      <StorylineContributions
        seedTopic={seed?.title ?? null}
        seedToken={seed?.token ?? 0}
      />
    </>
  );
}
