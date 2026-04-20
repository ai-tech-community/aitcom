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
import { useTranslations } from "next-intl";
import { BENCHMARK_MODEL_PROVIDERS } from "@/lib/benchmark-constants";

export function ManualRunForm({
  promptId,
  onDone,
}: {
  promptId: string;
  onDone: () => void;
}) {
  const t = useTranslations("benchmark");
  const utils = api.useUtils();
  const [provider, setProvider] = useState<string>("openai");
  const [modelId, setModelId] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");

  const submit = api.benchmark.submitRun.useMutation({
    onSuccess: () => {
      toast.success(t("manualRun.successToast"));
      void utils.benchmark.listMySubmissions.invalidate();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="bg-muted/30 flex flex-col gap-2 rounded-md p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BENCHMARK_MODEL_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t("manualRun.modelIdPlaceholder")}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        />
      </div>
      <Textarea
        placeholder={t("manualRun.rawAnswerPlaceholder")}
        value={rawAnswer}
        onChange={(e) => setRawAnswer(e.target.value)}
        rows={6}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t("manualRun.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!modelId.trim() || !rawAnswer.trim() || submit.isPending}
          onClick={() =>
            submit.mutate({
              promptId,
              modelProvider:
                provider as (typeof BENCHMARK_MODEL_PROVIDERS)[number],
              modelId: modelId.trim(),
              rawAnswer,
            })
          }
        >
          {submit.isPending ? t("manualRun.submitting") : t("manualRun.submitRun")}
        </Button>
      </div>
    </div>
  );
}
