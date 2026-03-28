"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BENCHMARK_TOPICS,
  BENCHMARK_TOPIC_LABELS,
  BENCHMARK_DIFFICULTIES,
  BENCHMARK_DIFFICULTY_LABELS,
} from "@/lib/benchmark-constants";

export function SubmitQuestionForm() {
  const { data: session } = authClient.useSession();

  const [question, setQuestion] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [explanation, setExplanation] = useState("");
  const [topic, setTopic] = useState<(typeof BENCHMARK_TOPICS)[number] | "">("");
  const [difficulty, setDifficulty] = useState<(typeof BENCHMARK_DIFFICULTIES)[number] | "">("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = api.benchmark.submitQuestion.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Question submitted successfully!");
    },
    onError: () => {
      toast.error("Failed to submit question. Please try again.");
    },
  });

  if (!session?.user) {
    return (
      <p className="text-muted-foreground text-sm">
        Sign in to contribute questions.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Question submitted! Thank you for contributing.</p>
        <Button
          onClick={() => {
            setQuestion("");
            setCorrectAnswer("");
            setOptionB("");
            setOptionC("");
            setOptionD("");
            setExplanation("");
            setTopic("");
            setDifficulty("");
            setSubmitted(false);
          }}
          className="font-mono text-xs tracking-wider"
        >
          Submit Another
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !difficulty) return;
    submitMutation.mutate({
      question,
      correctAnswer,
      optionB,
      optionC,
      optionD,
      explanation: explanation || undefined,
      topic,
      difficulty,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Question
        </label>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          minLength={10}
          rows={3}
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Correct Answer
        </label>
        <Input
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Wrong Answer 1
        </label>
        <Input
          value={optionB}
          onChange={(e) => setOptionB(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Wrong Answer 2
        </label>
        <Input
          value={optionC}
          onChange={(e) => setOptionC(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Wrong Answer 3
        </label>
        <Input
          value={optionD}
          onChange={(e) => setOptionD(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          Why is the correct answer right? (optional)
        </label>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            Topic
          </label>
          <Select value={topic} onValueChange={(v) => setTopic(v as typeof topic)} required>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select topic" />
            </SelectTrigger>
            <SelectContent>
              {BENCHMARK_TOPICS.map((t) => (
                <SelectItem key={t} value={t}>
                  {BENCHMARK_TOPIC_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            Difficulty
          </label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)} required>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              {BENCHMARK_DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {BENCHMARK_DIFFICULTY_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        type="submit"
        className="w-full font-mono text-xs tracking-wider"
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? "Submitting..." : "Submit Question"}
      </Button>
    </form>
  );
}
