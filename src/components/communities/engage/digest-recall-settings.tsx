"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

type Toggles = {
  ritualRecap: boolean;
  ritualReminder: boolean;
  atRiskLine: boolean;
};

export function DigestRecallSettings({ slug }: { slug: string }) {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.engageConfig.get.useQuery({ slug });
  const [draft, setDraft] = useState<Toggles | null>(null);

  const set = api.engageConfig.set.useMutation({
    onSuccess: () => {
      void utils.engageConfig.get.invalidate({ slug });
    },
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  // Owner/admin-only surface — hide entirely when the procedure forbids.
  if (error?.data?.code === "FORBIDDEN") return null;

  const current = draft ?? data ?? null;

  const update = (patch: Partial<Toggles>) => {
    if (!current) return;
    const next = { ...current, ...patch };
    setDraft(next);
    set.mutate({ slug, ...next });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Digest recall</h2>
        <p className="text-muted-foreground text-sm">
          What ritual content the weekly digest includes for your members.
        </p>
      </div>

      <div className="rounded-lg border">
        {isLoading || !current ? (
          <div
            role="status"
            aria-label="Loading digest recall settings"
            className="h-32 animate-pulse"
          />
        ) : (
          <div className="divide-y">
            <Row
              label="Ritual recap"
              description="Summarize this week's ritual threads and their replies."
              checked={current.ritualRecap}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ ritualRecap: v })}
            />
            <Row
              label="Ritual reminder"
              description="Tease the next upcoming ritual prompt."
              checked={current.ritualReminder}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ ritualReminder: v })}
            />
            <Row
              label="At-risk line"
              description="Shows a personal 'we miss you' line to members who've gone quiet."
              checked={current.atRiskLine}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ atRiskLine: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="shrink-0"
      />
    </label>
  );
}
