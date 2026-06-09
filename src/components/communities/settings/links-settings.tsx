"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

interface LinkRow {
  label: string;
  url: string;
  emoji?: string;
}

export function LinksSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.links");
  const utils = api.useUtils();
  const { data } = api.links.list.useQuery({ communitySlug: slug });
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setRows(
        data.map((d) => ({
          label: d.label,
          url: d.url,
          emoji: d.emoji ?? undefined,
        })),
      );
      setInitialized(true);
    }
  }, [data, initialized]);

  const save = api.links.setAll.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      void utils.links.list.invalidate();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  const update = (i: number, patch: Partial<LinkRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-end gap-2">
            <Input
              className="w-16"
              value={row.emoji ?? ""}
              onChange={(e) => update(i, { emoji: e.target.value })}
              maxLength={8}
              placeholder="🔗"
              aria-label={t("emoji")}
            />
            <Input
              className="flex-1"
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={60}
              placeholder={t("labelPlaceholder")}
            />
            <Input
              className="flex-1"
              value={row.url}
              onChange={(e) => update(i, { url: e.target.value })}
              maxLength={500}
              placeholder="https://… or /communities/…"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              aria-label={t("remove")}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setRows((r) => [...r, { label: "", url: "" }])}
        >
          <Plus className="mr-1.5 size-4" /> {t("addLink")}
        </Button>
        <Button
          onClick={() =>
            save.mutate({
              communitySlug: slug,
              links: rows.filter((r) => r.label.trim() && r.url.trim()),
            })
          }
          disabled={save.isPending}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
