"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Config = {
  requireResponse: boolean;
  requireProfileComplete: boolean;
  windowDays: number;
};

export function ActivationSettings({ slug }: { slug: string }) {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.activationConfig.get.useQuery({
    slug,
  });
  const [draft, setDraft] = useState<Config | null>(null);

  const set = api.activationConfig.set.useMutation({
    onSuccess: () => {
      void utils.activationConfig.get.invalidate({ slug });
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
        <h2 className="text-lg font-semibold">Activation milestone</h2>
        <p className="text-muted-foreground text-sm">
          When a newcomer is counted as activated in your community.
        </p>
      </div>

      <div className="rounded-lg border">
        {isLoading || !current ? (
          <div
            role="status"
            aria-label="Loading activation settings"
            className="h-32 animate-pulse"
          />
        ) : (
          <div className="divide-y">
            <Row
              label="Require a response to activate"
              description="Count a newcomer activated only once their first contribution gets a reply."
              checked={current.requireResponse}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ requireResponse: v })}
            />
            <Row
              label="Require a completed profile"
              description="Also require a completed profile (onboarding done + interests & experience set)."
              checked={current.requireProfileComplete}
              disabled={set.isPending}
              onCheckedChange={(v) => update({ requireProfileComplete: v })}
            />
            <div className="p-4">
              <Label className="text-sm font-medium">
                Response window (days)
              </Label>
              <p className="text-muted-foreground mt-1 text-xs">
                How many days after a newcomer&apos;s first post to wait for a
                reply before the window closes.
              </p>
              <Input
                type="number"
                min={1}
                max={30}
                value={current.windowDays}
                disabled={set.isPending}
                className="mt-2 w-24"
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 30) {
                    update({ windowDays: v });
                  }
                }}
              />
            </div>
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
