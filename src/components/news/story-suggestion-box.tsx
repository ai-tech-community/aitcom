"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/trpc/react";
import { storySuggestionTextLimit } from "@/lib/news/story-suggestion-context";

export type SuggestionStory = { title: string; slug: string };

export function StorySuggestionBox({
  story,
  showHeading = true,
  className,
}: {
  story?: SuggestionStory;
  showHeading?: boolean;
  className?: string;
}) {
  const t = useTranslations("newsStories.contribute");
  const { authStatus, requireAuth } = useRequireAuth();
  const fieldId = useId();
  const helpId = useId();
  const noticeId = useId();
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
            : err.message === "long"
              ? t("suggestLong")
              : err.message === "short"
                ? t("suggestShort")
                : t("suggestFailed");
      setNotice(message);
      toast.error(message);
    },
  });

  return (
    <form
      className={cn("space-y-5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);
        requireAuth(
          () =>
            submit.mutate({
              text,
              ...(story ? { storySlug: story.slug } : {}),
            }),
          t("suggestSignIn"),
        );
      }}
    >
      {showHeading && (
        <div>
          <h2 className="text-xl font-semibold">{t("suggestTitle")}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("suggestHelp")}
          </p>
        </div>
      )}
      {story && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm leading-relaxed">
          <span className="text-muted-foreground">{t("aboutStory")} </span>
          <span className="font-medium">{story.title}</span>
        </p>
      )}
      {authStatus === "guest" ? (
        <Button
          type="button"
          variant="ink"
          onClick={() => requireAuth(() => undefined, t("suggestSignIn"))}
        >
          {t("suggestSignIn")}
        </Button>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{t("suggestLabel")}</Label>
            <Textarea
              id={fieldId}
              className="min-h-28 resize-y"
              aria-describedby={`${helpId} ${notice ? noticeId : ""}`.trim()}
              value={text}
              maxLength={storySuggestionTextLimit(story?.slug)}
              disabled={authStatus !== "authenticated" || submit.isPending}
              required
              placeholder={t("suggestHint")}
              onChange={(event) => {
                setText(event.target.value);
                setNotice(null);
              }}
            />
            <p
              id={helpId}
              className="text-muted-foreground text-xs leading-relaxed"
            >
              {t("suggestPrivacy")}
            </p>
          </div>
          <Button
            type="submit"
            variant="ink"
            className="w-full sm:w-auto"
            disabled={
              submit.isPending ||
              authStatus === "pending" ||
              authStatus === "unknown" ||
              !text.trim()
            }
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
        </>
      )}
      {authStatus === "unknown" && (
        <p role="alert" className="text-sm">
          {t("sessionFailed")}. {t("sessionRetry")}
        </p>
      )}
      {notice ? (
        <p
          id={noticeId}
          className="text-muted-foreground text-sm"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </form>
  );
}
