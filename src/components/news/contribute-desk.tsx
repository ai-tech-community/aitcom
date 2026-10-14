"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { storylineResearchBrief } from "@/lib/news/research-brief";
import type { WeeklyTopic } from "@/lib/news/weekly-topics";
import { api } from "@/trpc/react";

import { StorylineContributions } from "./storyline-contributions";
import { StorySuggestionBox } from "./story-suggestion-box";

function ClaimCountdown({ expiresAt }: { expiresAt: Date }) {
  const t = useTranslations("newsStories.contribute");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = expiresAt.getTime() - now;
  if (remaining <= 0) {
    return (
      <p className="text-muted-foreground font-mono text-xs">
        {t("claimExpired")}
      </p>
    );
  }
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return (
    <p className="text-muted-foreground font-mono text-xs">
      {t("claimCountdown", { hours, minutes })}
    </p>
  );
}

export function ContributeDesk({ topics }: { topics: WeeklyTopic[] }) {
  const t = useTranslations("newsStories.contribute");
  const { authStatus, requireAuth } = useRequireAuth();
  const [seed, setSeed] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const utils = api.useUtils();
  const signedIn = authStatus === "authenticated";
  const agent = api.agentManagement.getMyAgent.useQuery(undefined, {
    enabled: signedIn,
  });
  const claims = api.news.myStoryClaims.useQuery(undefined, {
    enabled: signedIn,
  });
  const coverage = api.news.storyCoverageToday.useQuery(undefined, {
    enabled: topics.length > 0,
  });
  const claim = api.news.claimStoryTopic.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.news.myStoryClaims.invalidate(),
        utils.news.storyCoverageToday.invalidate(),
      ]);
      if (result.alreadyClaimed) toast.success(t("claimAlready"));
      else if (result.firstScoop) {
        toast.success(t("claimBreaking", { points: result.pointsAwarded }));
      } else toast.success(t("claimSaved", { points: result.pointsAwarded }));
    },
    onError: () => toast.error(t("claimFailed")),
  });

  const copyBrief = async (topic: WeeklyTopic) => {
    const name =
      agent.data?.status === "active" && agent.data.name
        ? agent.data.name
        : t("yourAgentFallback");
    const brief = storylineResearchBrief(name, topic.title, topic.topicKey);
    try {
      await navigator.clipboard.writeText(brief);
      return true;
    } catch {
      setSeed(topic.title);
      return false;
    }
  };

  const claimTopic = (topic: WeeklyTopic) => {
    requireAuth(() => {
      setPendingKey(topic.topicKey);
      void (async () => {
        const copied = await copyBrief(topic);
        setSeed(topic.title);
        try {
          await claim.mutateAsync({
            topicKey: topic.topicKey,
            title: topic.title,
          });
          if (!copied) toast.error(t("claimCopyFailed"));
        } finally {
          setPendingKey(null);
        }
      })();
    }, t("claimSignIn"));
  };

  const claimByKey = new Map<string, NonNullable<typeof claims.data>[number]>();
  for (const row of claims.data ?? []) {
    if (!claimByKey.has(row.topicKey)) claimByKey.set(row.topicKey, row);
  }

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
          {coverage.data?.visible ? (
            <div className="mt-4 max-w-md">
              <p id="topic-coverage" className="text-sm">
                {t("coverage", {
                  covered: coverage.data.covered,
                  total: coverage.data.total,
                })}
              </p>
              <Progress
                className="bg-foreground/15 mt-2"
                indicatorClassName="bg-foreground"
                value={(coverage.data.covered / coverage.data.total) * 100}
                aria-labelledby="topic-coverage"
              />
            </div>
          ) : null}
          <ul className="mt-4 divide-y rounded-lg border">
            {topics.map((topic) => {
              const mine = claimByKey.get(topic.topicKey);
              return (
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
                    {mine?.expiresAt ? (
                      <ClaimCountdown expiresAt={new Date(mine.expiresAt)} />
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingKey === topic.topicKey}
                    onClick={() => claimTopic(topic)}
                  >
                    {t("claim")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <StorySuggestionBox />
      <StorylineContributions seedTopic={seed} />
    </>
  );
}
