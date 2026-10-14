"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { WeeklyTopic } from "@/lib/news/weekly-topics";
import { Button } from "@/components/ui/button";
import { StorylineContributions } from "./storyline-contributions";
import { StorySuggestionBox } from "./story-suggestion-box";

export function ContributeDesk({ topics }: { topics: WeeklyTopic[] }) {
  const t = useTranslations("newsStories.contribute");
  const [seed, setSeed] = useState<string | null>(null);
  return (
    <>
      {topics.length > 0 ? (
        <section className="mt-8" aria-labelledby="weekly-topics-heading">
          <h2 id="weekly-topics-heading" className="text-xl font-semibold">
            {t("topicsTitle")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("topicsHelp")}
          </p>
          <ul className="mt-4 divide-y rounded-lg border">
            {topics.map((topic) => (
              <li
                key={topic.topicKey}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{topic.title}</p>
                  {topic.articleIds.length > 1 ? (
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {t("topicArticles", { count: topic.articleIds.length })}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSeed(topic.title)}
                >
                  {t("useTopic")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <StorySuggestionBox />
      <StorylineContributions seedTopic={seed} />
    </>
  );
}
