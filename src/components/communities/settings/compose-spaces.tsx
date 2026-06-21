"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/error-state";
import {
  resolveSpaceLabel,
  type BuiltinSurface,
} from "@/server/communities/space-defaults";

export function ComposeSpaces({ slug }: { slug: string }) {
  const t = useTranslations("communities.spaces");
  const tProfile = useTranslations("communities.profile");
  const utils = api.useUtils();

  const {
    data: spaces,
    isLoading,
    isError,
    refetch,
  } = api.spaces.listForAdmin.useQuery({ slug });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const invalidate = async () => {
    await Promise.all([
      utils.spaces.listForAdmin.invalidate({ slug }),
      utils.spaces.list.invalidate({ slug }),
    ]);
  };

  const setEnabled = api.spaces.setEnabled.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const reorder = api.spaces.reorder.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const rename = api.spaces.rename.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={refetch} />;

  const ordered = spaces ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ordered];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate({ slug, orderedIds: next.map((s) => s.id) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <ul className="divide-y rounded-lg border">
        {ordered.map((space, index) => {
          const label = resolveSpaceLabel(
            {
              kind: space.kind,
              builtinSurface: space.builtinSurface,
              name: space.name,
            },
            (k: BuiltinSurface) => tProfile(k),
          );
          return (
            <li key={space.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-label={t("moveUp")}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={t("moveDown")}
                  disabled={index === ordered.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editingId === space.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder={label}
                      maxLength={60}
                      className="h-8"
                      aria-label={t("rename")}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        rename.mutate({
                          slug,
                          spaceId: space.id,
                          name: draftName,
                        })
                      }
                      disabled={rename.isPending}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-sm font-medium hover:underline"
                    onClick={() => {
                      setEditingId(space.id);
                      setDraftName(space.name ?? "");
                    }}
                  >
                    {label}
                  </button>
                )}
              </div>

              <Switch
                checked={space.enabled}
                onCheckedChange={(checked) =>
                  setEnabled.mutate({
                    slug,
                    spaceId: space.id,
                    enabled: checked,
                  })
                }
                aria-label={t("enabledToggle")}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
