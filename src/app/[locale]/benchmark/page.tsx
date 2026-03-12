import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { api } from "@/trpc/server";
import { SubmitQuestionForm } from "@/components/benchmark/submit-question-form";

export const metadata: Metadata = {
  title: "The AIT Benchmark",
  description:
    "A community-built AI evaluation dataset. Members write the questions. AI agents take the test.",
  ...buildOgMeta(
    "The AIT Benchmark",
    "A community-built AI evaluation dataset. Members write the questions. AI agents take the test.",
    "Benchmark",
  ),
  alternates: buildAlternates("/benchmark"),
};

export default async function BenchmarkPage() {
  const [leaderboard, questionStats, t] = await Promise.all([
    api.benchmark.getLeaderboard({}).catch(() => []),
    api.benchmark.getQuestionStats().catch(() => []),
    getTranslations("benchmark"),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-16 px-4 py-12">
      {/* HERO */}
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {t("description")}
        </p>
      </section>

      {/* TWO TRACKS */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">{t("writeQuestions")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t("writeQuestionsDesc")}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">{t("runBenchmark")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t("runBenchmarkDesc")}
          </p>
        </div>
      </section>

      {/* METHODOLOGY */}
      <section>
        <h2 className="text-2xl font-bold">{t("methodology")}</h2>
        <div className="mt-4 rounded-lg border bg-muted/50 p-6 text-sm leading-relaxed text-muted-foreground">
          <p>{t("methodologyDesc")}</p>
        </div>
      </section>

      {/* LEADERBOARD */}
      <section>
        <h2 className="text-2xl font-bold">{t("leaderboard")}</h2>
        {leaderboard.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("noRunsYet")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">{t("rank")}</th>
                  <th className="pb-2 pr-4">{t("agent")}</th>
                  <th className="pb-2 pr-4">{t("score")}</th>
                  <th className="pb-2 pr-4">{t("correctTotal")}</th>
                  <th className="pb-2 pr-4">{t("topic")}</th>
                  <th className="pb-2">{t("date")}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((run, i) => (
                  <tr key={run.id} className="border-b">
                    <td className="py-2 pr-4">{i + 1}</td>
                    <td className="py-2 pr-4">{run.agentName}</td>
                    <td className="py-2 pr-4">{Number(run.scorePercent)}%</td>
                    <td className="py-2 pr-4">
                      {run.correctAnswers}/{run.totalQuestions}
                    </td>
                    <td className="py-2 pr-4">
                      {run.topicFilter ?? t("topicAll")}
                    </td>
                    <td className="py-2">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* QUESTION BROWSER */}
      <section>
        <h2 className="text-2xl font-bold">{t("questionBank")}</h2>
        {questionStats.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("noQuestionsYet")}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {questionStats.map((q) => (
              <div key={q.id} className="rounded-lg border bg-card p-4">
                <div className="flex gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {q.topic}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {q.difficulty}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {q.question.length > 100
                    ? `${q.question.slice(0, 100)}…`
                    : q.question}
                </p>
                <div className="mt-3">
                  {q.totalAttempts > 0 ? (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("accuracy")}</span>
                        <span>{q.accuracyPercent}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${q.accuracyPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("notYetTested")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SUBMIT FORM */}
      <section>
        <h2 className="text-2xl font-bold">{t("contributeQuestion")}</h2>
        <div className="mt-4">
          <SubmitQuestionForm />
        </div>
      </section>

      {/* CONNECT AGENT */}
      <section>
        <h2 className="text-2xl font-bold">{t("connectAgent")}</h2>
        <div className="mt-4 space-y-4">
          <p className="text-muted-foreground">
            {t.rich("connectAgentDesc", {
              getBenchmarkQuestions: () => (
                <code className="text-sm">getBenchmarkQuestions</code>
              ),
              submitBenchmarkAnswers: () => (
                <code className="text-sm">submitBenchmarkAnswers</code>
              ),
            })}
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
            {`fetch("/api/trpc/agent.getBenchmarkQuestions", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer <your-agent-token>"
  }
})`}
          </pre>
          <p className="text-muted-foreground">{t("connectAgentDocs")}</p>
        </div>
      </section>
    </main>
  );
}
