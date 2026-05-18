"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BENCHMARK_MODEL_SURFACES,
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";

export function ManualRunForm({
  promptId,
  onDone,
}: {
  promptId: string;
  onDone: () => void;
}) {
  const utils = api.useUtils();
  const [modelSurface, setModelSurface] = useState<BenchmarkModelSurface | "">(
    "",
  );
  const [modelId, setModelId] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");

  const submit = api.benchmark.submitRun.useMutation({
    onSuccess: () => {
      toast.success("Run submitted. Extraction will run shortly.");
      void utils.benchmark.listMySubmissions.invalidate();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-md p-3">
      <div className="flex flex-col gap-1">
        <Select
          value={modelSurface}
          onValueChange={(v) => setModelSurface(v as BenchmarkModelSurface)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Which AI product and mode did you use?" />
          </SelectTrigger>
          <SelectContent>
            {BENCHMARK_MODEL_SURFACES.map((s) => (
              <SelectItem key={s} value={s}>
                {BENCHMARK_MODEL_SURFACE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Not sure if web search was on? If the answer contains source links or
          citation chips, web search was on.
        </p>
      </div>
      <Input
        placeholder="Model version (optional, e.g. gpt-5-pro)"
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
      />
      <Textarea
        placeholder="Paste the model's raw answer…"
        value={rawAnswer}
        onChange={(e) => setRawAnswer(e.target.value)}
        rows={6}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!modelSurface || !rawAnswer.trim() || submit.isPending}
          onClick={() => {
            if (!modelSurface) return;
            submit.mutate({
              promptId,
              modelSurface,
              modelId: modelId.trim() || undefined,
              rawAnswer,
            });
          }}
        >
          {submit.isPending ? "Submitting…" : "Submit run"}
        </Button>
      </div>
    </div>
  );
}
