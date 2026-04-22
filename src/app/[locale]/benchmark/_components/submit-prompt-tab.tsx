"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function SubmitPromptTab() {
  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const submissions = api.benchmark.listMySubmissions.useQuery();
  const utils = api.useUtils();

  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [intentId, setIntentId] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const submit = api.benchmark.submitPrompt.useMutation({
    onSuccess: () => {
      toast.success("Prompt submitted for review.");
      setText("");
      setTagsInput("");
      void utils.benchmark.listMySubmissions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    text.trim().length >= 4 && categoryId && intentId && !submit.isPending;

  return (
    <div className="grid gap-6 py-4 md:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Propose a prompt</h2>
        <Textarea
          placeholder="e.g. What is the best CRM for early-stage startups?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={4}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={intentId} onValueChange={setIntentId}>
            <SelectTrigger>
              <SelectValue placeholder="Intent" />
            </SelectTrigger>
            <SelectContent>
              {intents.data?.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          type="text"
          placeholder="Tags (comma-separated, e.g. b2b, saas)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <Button
          onClick={() => {
            const parsedTags = tagsInput
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0);
            submit.mutate({
              text: text.trim(),
              categoryId,
              intentId,
              locale: "en-US",
              tags: parsedTags,
            });
          }}
          disabled={!canSubmit}
        >
          {submit.isPending ? "Submitting…" : "Submit for review"}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">My submissions</h2>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {submissions.data?.prompts.length === 0 && (
            <li className="text-muted-foreground p-3">No submissions yet.</li>
          )}
          {submissions.data?.prompts.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 p-3">
              <div className="flex justify-between gap-3">
                <span className="truncate">{p.text}</span>
                <span className="text-muted-foreground text-xs tracking-wide uppercase">
                  {p.status}
                </span>
              </div>
              {p.tags && p.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {p.tags.map((t: string) => (
                    <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
