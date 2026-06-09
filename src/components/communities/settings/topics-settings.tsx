"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function TopicsSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.topics");
  const utils = api.useUtils();
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");

  const create = api.topics.create.useMutation({
    onSuccess: () => {
      setLabel("");
      setEmoji("");
      void utils.topics.list.invalidate();
    },
    onError: (e) =>
      toast.error(
        e.message === "TOPIC_CAP_REACHED"
          ? t("capReached")
          : e.message === "TOPIC_SLUG_EXISTS"
            ? t("slugExists")
            : e.message === "TOPIC_SLUG_RESERVED"
              ? t("slugReserved")
              : t("createFailed"),
      ),
  });
  const remove = api.topics.remove.useMutation({
    onSuccess: () => void utils.topics.list.invalidate(),
    onError: (e) =>
      toast.error(
        e.message === "CANNOT_DELETE_DEFAULT"
          ? t("cannotDeleteDefault")
          : t("deleteFailed"),
      ),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <ul className="space-y-2">
        {(topics ?? []).map((tp) => (
          <li
            key={tp.id}
            className="border-border flex items-center justify-between rounded-md border px-3 py-2"
          >
            <span className="text-sm">
              {tp.emoji ? `${tp.emoji} ` : ""}
              {tp.label}
              {tp.isDefault ? ` · ${t("defaultTag")}` : ""}
            </span>
            {!tp.isDefault ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => remove.mutate({ id: tp.id })}
                aria-label={t("delete")}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          create.mutate({
            communitySlug: slug,
            label: label.trim(),
            emoji: emoji.trim() || undefined,
          });
        }}
      >
        <div className="w-16">
          <label className="text-muted-foreground text-xs">
            {t("emojiLabel")}
          </label>
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={8}
            placeholder="⭐"
          />
        </div>
        <div className="flex-1">
          <label className="text-muted-foreground text-xs">
            {t("labelLabel")}
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder={t("placeholder")}
          />
        </div>
        <Button type="submit" disabled={!label.trim() || create.isPending}>
          {t("add")}
        </Button>
      </form>
    </div>
  );
}
