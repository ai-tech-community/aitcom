"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  storylineResearchBrief,
  storylineTopicKey,
} from "@/lib/news/research-brief";
import { storylineSlugSchema } from "@/lib/news/storylines";

export function StorylineContributions({
  seedTopic = null,
}: {
  seedTopic?: string | null;
}) {
  const t = useTranslations("newsStories.contribute");
  const fmt = useFormatter();
  const { authStatus, requireAuth } = useRequireAuth();
  const board = api.news.listStorylineResearch.useQuery();
  const agent = api.agentManagement.getMyAgent.useQuery(undefined, {
    enabled: authStatus === "authenticated",
  });
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const topicKey = storylineTopicKey(title.trim());
  const validTopic = storylineSlugSchema.safeParse(topicKey).success;
  const coverage = api.news.storylineCoverage.useQuery(
    { topicKey },
    { enabled: validTopic },
  );
  const covered = coverage.data && coverage.data.state !== "available";
  const prepare = () =>
    requireAuth(() => {
      if (
        !validTopic ||
        agent.data?.status !== "active" ||
        coverage.isFetching ||
        coverage.isError ||
        coverage.data?.state !== "available"
      )
        return;
      setBrief(storylineResearchBrief(agent.data.name, title.trim(), topicKey));
      setCopied(false);
      setCopyFailed(false);
    }, t("signIn"));
  const editTitle = (value: string) => {
    setTitle(value);
    setBrief("");
    setCopied(false);
    setCopyFailed(false);
  };
  useEffect(() => {
    if (!seedTopic) return;
    setTitle(seedTopic);
    setBrief("");
    setCopied(false);
    setCopyFailed(false);
  }, [seedTopic]);
  return (
    <>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section
          className="min-w-0 rounded-lg border p-6"
          aria-labelledby="research-brief-heading"
        >
          <h2 id="research-brief-heading" className="text-xl font-semibold">
            {t("prepareTitle")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("prepareIntro")}
          </p>
          <label className="mt-6 block text-sm" htmlFor="research-topic">
            {t("topic")}
          </label>
          <Input
            id="research-topic"
            value={title}
            onChange={(e) => editTitle(e.target.value)}
            placeholder={t("topicHint")}
            maxLength={200}
            className="mt-2"
          />
          {title.trim() && !validTopic && (
            <p role="alert" className="mt-3 text-sm">
              {t("invalidTopic")}
            </p>
          )}
          {validTopic && (
            <div className="mt-3 text-sm" aria-live="polite">
              {coverage.isError ? (
                <ErrorState
                  title={t("coverageFailed")}
                  onRetry={() => void coverage.refetch()}
                />
              ) : coverage.isFetching ? (
                <p className="text-muted-foreground">{t("checking")}</p>
              ) : covered ? (
                <p>
                  {t(coverage.data.state)}{" "}
                  {coverage.data?.slug && (
                    <Link
                      className="underline underline-offset-4"
                      href={`/news/stories/${coverage.data.slug}`}
                    >
                      {t("readStory")}
                    </Link>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground">{t("available")}</p>
              )}
            </div>
          )}
          {authStatus === "unknown" ? (
            <ErrorState
              title={t("sessionFailed")}
              description={t("sessionRetry")}
            />
          ) : authStatus === "pending" ? (
            <Skeleton className="mt-5 h-10 w-full" />
          ) : authStatus === "authenticated" && agent.isError ? (
            <ErrorState
              title={t("agentFailed")}
              onRetry={() => void agent.refetch()}
            />
          ) : authStatus === "authenticated" && agent.isPending ? (
            <Skeleton className="mt-5 h-10 w-full" />
          ) : authStatus === "authenticated" &&
            agent.data?.status !== "active" ? (
            <div className="mt-5">
              <Link
                href="/dashboard/agent?tab=connect"
                className="text-sm underline underline-offset-4"
              >
                {t("connectAgent")}
              </Link>
            </div>
          ) : (
            <>
              {agent.data && authStatus === "authenticated" && (
                <p className="mt-5 text-sm">
                  {t("yourAgent", { name: agent.data.name })}
                </p>
              )}
              <Button
                className="mt-5"
                onClick={prepare}
                disabled={
                  !validTopic ||
                  !!covered ||
                  coverage.isFetching ||
                  coverage.isError ||
                  !coverage.data
                }
              >
                {t("prepare")}
              </Button>
            </>
          )}
          <p className="text-muted-foreground mt-4 text-sm">{t("runtime")}</p>
          {brief && (
            <div className="mt-6">
              <label
                htmlFor="agent-research-brief"
                className="text-sm font-medium"
              >
                {t("briefReady")}
              </label>
              <Textarea
                id="agent-research-brief"
                className="mt-2 min-h-64"
                value={brief}
                readOnly
              />
              <Button
                variant="outline"
                className="mt-3"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(brief);
                    setCopied(true);
                    setCopyFailed(false);
                  } catch {
                    setCopyFailed(true);
                  }
                }}
              >
                {t("copy")}
              </Button>
              <p className="mt-2 text-sm" aria-live="polite">
                {copyFailed
                  ? t("copyFailed")
                  : copied
                    ? t("copied")
                    : t("paste")}
              </p>
            </div>
          )}
        </section>
        <section className="min-w-0" aria-labelledby="research-board-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="research-board-heading" className="text-xl font-semibold">
              {t("board")}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void board.refetch()}
              disabled={board.isFetching}
            >
              {t("refresh")}
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("boardIntro")}
          </p>
          {board.isError ? (
            <ErrorState onRetry={() => void board.refetch()} />
          ) : board.isPending ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !board.data?.length ? (
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          ) : (
            <ul className="mt-5 divide-y">
              {board.data.map((row) => (
                <li key={row.topicKey} className="py-5">
                  <p className="text-muted-foreground text-xs">
                    {t(row.state)}
                  </p>
                  <h3 className="mt-2 font-semibold">{row.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {row.agentName
                      ? t("researchBy", { name: row.agentName })
                      : t("memberAgent")}
                  </p>
                  {row.expiresAt && (
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {t("expires", {
                        date: fmt.dateTime(row.expiresAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </p>
                  )}
                  {row.slug && (
                    <Link
                      className="mt-3 inline-block text-sm underline underline-offset-4"
                      href={`/news/stories/${row.slug}`}
                    >
                      {t("readStory")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-6 text-sm">{t("leaseHint")}</p>
        </section>
      </div>
    </>
  );
}
