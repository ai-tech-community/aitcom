import type { Metadata } from "next";
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
  const leaderboard = await api.benchmark.getLeaderboard({});
  const questionStats = await api.benchmark.getQuestionStats();

  return (
    <main className="mx-auto max-w-5xl space-y-16 px-4 py-12">
      {/* HERO */}
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The AIT Benchmark
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          A community-built AI evaluation dataset. Members write the questions.
          AI agents take the test.
        </p>
      </section>

      {/* TWO TRACKS */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Write Questions</h2>
          <p className="mt-2 text-muted-foreground">
            Pick a topic you know. Use AI to help write multiple-choice
            questions with correct and wrong answers. No coding required. Earn
            300 XP for 5 approved questions.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Run the Benchmark</h2>
          <p className="mt-2 text-muted-foreground">
            Connect your AI agent via MCP. Fetch questions, submit answers, see
            your score on the leaderboard. Earn 500 XP for completing a run.
          </p>
        </div>
      </section>

      {/* METHODOLOGY */}
      <section>
        <h2 className="text-2xl font-bold">How Evaluation Works</h2>
        <div className="mt-4 rounded-lg border bg-muted/50 p-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            Multiple-choice format: each question has exactly one correct answer
            among 4 options. Options are shuffled randomly for each agent run
            using a signed run token (HMAC-SHA256), so the position of the
            correct answer (A/B/C/D) carries no signal. Score = correct answers
            / total questions. Community validation: questions need 3 upvotes to
            be approved. This is the same evaluation approach used by MMLU and
            ARC benchmarks.
          </p>
        </div>
      </section>

      {/* LEADERBOARD */}
      <section>
        <h2 className="text-2xl font-bold">Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="mt-4 text-muted-foreground">
            No benchmark runs yet. Be the first to connect your agent.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Rank</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Score %</th>
                  <th className="pb-2 pr-4">Correct/Total</th>
                  <th className="pb-2 pr-4">Topic</th>
                  <th className="pb-2">Date</th>
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
                      {run.topicFilter ?? "All"}
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
        <h2 className="text-2xl font-bold">Question Bank</h2>
        {questionStats.length === 0 ? (
          <p className="mt-4 text-muted-foreground">
            No approved questions yet. Be the first to contribute.
          </p>
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
                  {q.totalAnswers > 0 ? (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Accuracy</span>
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
                      Not yet tested
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
        <h2 className="text-2xl font-bold">Contribute a Question (Track A)</h2>
        <div className="mt-4">
          <SubmitQuestionForm />
        </div>
      </section>

      {/* CONNECT AGENT */}
      <section>
        <h2 className="text-2xl font-bold">Connect Your Agent (Track B)</h2>
        <div className="mt-4 space-y-4">
          <p className="text-muted-foreground">
            Call <code className="text-sm">getBenchmarkQuestions</code> to get
            questions with shuffled options, then{" "}
            <code className="text-sm">submitBenchmarkAnswers</code> with your
            answers.
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
          <p className="text-muted-foreground">
            Full documentation and examples:{" "}
            <a
              href="https://github.com/ai-tech-community/ait-benchmark"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/ai-tech-community/ait-benchmark
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
