"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  brandSlug: string;
  brandName: string;
  trigger?: React.ReactNode;
}

export function SuggestPromptsModal({ brandSlug, brandName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [submittedIdx, setSubmittedIdx] = useState<Set<number>>(new Set());

  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const utils = api.useUtils();

  const suggest = api.benchmark.suggestPrompts.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const submit = api.benchmark.submitPrompt.useMutation({
    onSuccess: () => {
      toast.success("Submitted for review.");
      void utils.benchmark.listMySubmissions.invalidate();
      void utils.benchmark.listApprovedPrompts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const categoriesBySlug = new Map(
    (categories.data ?? []).map((c) => [c.slug, c]),
  );
  const intentsBySlug = new Map((intents.data ?? []).map((i) => [i.slug, i]));

  const fetch = () => {
    setSubmittedIdx(new Set());
    suggest.mutate({ brandSlug, limit: 12 });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Suggest prompts</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suggested prompts for {brandName}</DialogTitle>
          <DialogDescription>
            AI-generated, neutral prompts the community can run against LLMs.
            Review and submit the ones you like.
          </DialogDescription>
        </DialogHeader>

        {!suggest.data && !suggest.isPending && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-muted-foreground text-sm">
              We&apos;ll ask an LLM to generate ~12 prompts that would naturally
              surface {brandName}. Nothing is submitted until you click each row.
            </p>
            <Button onClick={fetch}>Generate suggestions</Button>
          </div>
        )}

        {suggest.isPending && (
          <p className="text-muted-foreground py-4 text-sm">Generating…</p>
        )}

        {suggest.data && (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto py-2">
            {suggest.data.suggestions.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No usable suggestions came back. Try again.
              </p>
            )}
            {suggest.data.suggestions.map((s, i) => {
              const cat = categoriesBySlug.get(s.categorySlug);
              const intent = intentsBySlug.get(s.intentSlug);
              const disabled = !cat || !intent || submittedIdx.has(i);
              return (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded border p-3 text-sm"
                >
                  <p>{s.text}</p>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {cat && <Badge variant="secondary">{cat.name}</Badge>}
                    {intent && <Badge variant="outline">{intent.name}</Badge>}
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="bg-muted rounded px-1.5 py-0.5 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant={submittedIdx.has(i) ? "secondary" : "default"}
                    disabled={disabled || submit.isPending}
                    onClick={() => {
                      if (!cat || !intent) return;
                      submit.mutate(
                        {
                          text: s.text,
                          categoryId: cat.id,
                          intentId: intent.id,
                          locale: "en-US",
                          tags: s.tags,
                        },
                        {
                          onSuccess: () => {
                            setSubmittedIdx((prev) => {
                              const next = new Set(prev);
                              next.add(i);
                              return next;
                            });
                          },
                        },
                      );
                    }}
                  >
                    {submittedIdx.has(i) ? "Submitted ✓" : "Submit to community"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          {suggest.data && (
            <Button variant="ghost" size="sm" onClick={fetch}>
              Regenerate
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
