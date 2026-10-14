"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/trpc/react";

export function StorySuggestionBox() {
  const t = useTranslations("newsStories.contribute");
  const { authStatus, requireAuth } = useRequireAuth();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const submit = api.news.submitStorySuggestion.useMutation({
    onSuccess: () => {
      setText("");
      setNotice(t("suggestSent"));
      toast.success(t("suggestSent"));
    },
    onError: (err) => {
      const message =
        err.message === "rate"
          ? t("suggestRate")
          : err.message === "url"
            ? t("suggestInvalidUrl")
            : err.message === "short"
              ? t("suggestShort")
              : t("suggestShort");
      setNotice(message);
      toast.error(message);
    },
  });

  return (
    <form
      className="mt-8 max-w-2xl rounded-lg border p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);
        requireAuth(() => submit.mutate({ text }), t("suggestSignIn"));
      }}
    >
      <h2 className="text-xl font-semibold">{t("suggestTitle")}</h2>
      <p className="text-muted-foreground mt-2 text-sm">{t("suggestHelp")}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Label htmlFor="story-suggestion">{t("suggestLabel")}</Label>
        <Input
          id="story-suggestion"
          value={text}
          maxLength={500}
          required
          placeholder={t("suggestHint")}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className="mt-4"
        disabled={submit.isPending || authStatus === "pending" || !text.trim()}
        aria-busy={submit.isPending || undefined}
      >
        {submit.isPending ? (
          <Spinner
            className="motion-reduce:animate-none"
            role="presentation"
            aria-hidden="true"
            aria-label={undefined}
          />
        ) : null}
        {submit.isPending ? t("suggestSubmitting") : t("suggestSubmit")}
      </Button>
      {notice ? (
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
