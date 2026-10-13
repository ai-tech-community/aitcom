"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/trpc/react";

export function NewsRumorForm() {
  const t = useTranslations("newsPage");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const submit = api.news.submitRumor.useMutation({
    onSuccess: () => {
      setTitle("");
      setUrl("");
      setBody("");
      setNotice(t("submitted"));
      router.refresh();
    },
    onError: (err) => {
      setNotice(err.message === "rate" ? t("rateLimited") : t("invalid"));
    },
  });

  return (
    <form
      className="border-border mt-8 flex max-w-2xl flex-col gap-4 border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);
        submit.mutate({ title, url, body });
      }}
    >
      <div>
        <h2 className="text-base font-semibold">{t("formTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("formHelp")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rumor-title">{t("titleLabel")}</Label>
        <Input
          id="rumor-title"
          value={title}
          maxLength={140}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rumor-url">
          {t("urlLabel")}{" "}
          <span className="text-muted-foreground font-normal">
            {t("urlOptional")}
          </span>
        </Label>
        <Input
          id="rumor-url"
          type="url"
          inputMode="url"
          value={url}
          maxLength={2048}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rumor-body">{t("bodyLabel")}</Label>
        <Textarea
          id="rumor-body"
          value={body}
          maxLength={500}
          required
          rows={4}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
