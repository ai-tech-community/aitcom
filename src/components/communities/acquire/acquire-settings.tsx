"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

type Config = {
  crossPromote: boolean;
  referralsEnabled: boolean;
};

export function AcquireSettings({ slug }: { slug: string }) {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.acquireConfig.get.useQuery({ slug });
  const [draft, setDraft] = useState<Config | null>(null);

  const set = api.acquireConfig.set.useMutation({
    onSuccess: () => {
      void utils.acquireConfig.get.invalidate({ slug });
    },
    onError: () => {
      if (data) setDraft(data);
    },
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  // Owner/admin-only surface — hide entirely when the procedure forbids.
  if (error?.data?.code === "FORBIDDEN") return null;

  const current = draft ?? data ?? null;

  const update = (patch: Partial<Config>) => {
    if (!current) return;
    const next = { ...current, ...patch };
    setDraft(next);
    set.mutate({ slug, ...next });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Acquire settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure how your community acquires new members.
        </p>
      </div>

      <div className="rounded-lg border">
        {isLoading || !current ? (
          <div
            role="status"
            aria-label="Loading acquire settings"
            className="h-32 animate-pulse"
          />
        ) : (
          <div className="divide-y">
            <Row
              label="Cross-promote community"
              description="Allow your community to be recommended to members of similar communities."
              checked={current.crossPromote}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ crossPromote: v })}
            />
            <Row
              label="Enable referrals"
              description="Allow members to refer others and earn XP credit when their referrals join."
              checked={current.referralsEnabled}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ referralsEnabled: v })}
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
