"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { WeeklyTopic } from "@/lib/news/weekly-topics";

import { StorylineContributions } from "./storyline-contributions";
import { StorySuggestionBox } from "./story-suggestion-box";
import { WeeklyTopicClaims } from "./weekly-topic-claims";

export function ContributeDesk({ topics }: { topics: WeeklyTopic[] }) {
  const t = useTranslations("newsStories.contribute");
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchMounted, setResearchMounted] = useState(false);
  useEffect(() => {
    if (researchOpen) setResearchMounted(true);
  }, [researchOpen]);
  useEffect(() => {
    const revealResearch = () => {
      if (window.location.hash === "#agent-research") setResearchOpen(true);
    };
    revealResearch();
    window.addEventListener("hashchange", revealResearch);
    return () => window.removeEventListener("hashchange", revealResearch);
  }, []);
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
      <StorySuggestionBox showHeading={false} className="mt-8 max-w-2xl" />
      <details
        id="agent-research"
        className="border-border mt-8 scroll-mt-24 border-t pt-6"
        open={researchOpen}
        onToggle={(event) => setResearchOpen(event.currentTarget.open)}
      >
        <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
          {t("agentPath")}
        </summary>
        {(researchOpen || researchMounted) && (
          <>
            <p className="text-muted-foreground mt-3 max-w-prose text-sm leading-relaxed">
              {t("agentIntro")}
            </p>
            <WeeklyTopicClaims topics={topics} onTopicPlaced={placeTopic} />
            <StorylineContributions
              seedTopic={seed?.title ?? null}
              seedToken={seed?.token ?? 0}
            />
          </>
        )}
      </details>
    </>
  );
}
