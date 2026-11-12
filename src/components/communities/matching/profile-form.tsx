"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  cleanMatchingAnswers,
  matchingProfileInput,
  type ConnectionType,
  type MatchingProfile,
} from "@/lib/communities/matching";
import { toast } from "sonner";

export function MatchingProfileForm({
  slug,
  profile,
  types,
}: {
  slug: string;
  profile: MatchingProfile;
  types: ConnectionType[];
}) {
  const t = useTranslations("communityMatching");
  const id = useId();
  const utils = api.useUtils();
  const [value, setValue] = useState({
    ...profile,
    answers: cleanMatchingAnswers(profile.answers, types),
  });
  const [languages, setLanguages] = useState(profile.languages.join(", "));
  const [invalid, setInvalid] = useState(false);
  const save = api.communityMatching.saveProfile.useMutation({
    onSuccess: () => {
      toast.success(t("profileSaved"));
      void utils.communityMatching.setup.invalidate({ slug });
      void utils.communityMatching.suggestions.invalidate({ slug });
      void utils.communityMatching.participants.invalidate({ slug });
    },
  });
  const active = types.filter((type) => type.active);
  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const languageDraft = languages
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        const validLanguages =
          matchingProfileInput.shape.languages.safeParse(languageDraft).success;
        const parsed = matchingProfileInput.safeParse({
          ...value,
          languages:
            !value.optedIn && !validLanguages
              ? profile.languages
              : languageDraft,
        });
        setInvalid(!parsed.success);
        if (parsed.success) save.mutate({ slug, profile: parsed.data });
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          {t("profileDescription")}
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
        <Checkbox
          className="mt-0.5"
          tone="ink"
          disabled={save.isPending}
          checked={value.optedIn}
          onCheckedChange={(checked) =>
            setValue({ ...value, optedIn: checked === true })
          }
        />
        <span>
          <span className="block text-sm font-medium">{t("optIn")}</span>
          <span className="text-muted-foreground mt-1 block text-sm">
            {t("optInDescription")}
          </span>
        </span>
      </label>
      {value.optedIn && (
        <fieldset disabled={save.isPending} className="space-y-6">
          <p className="text-muted-foreground max-w-prose text-sm">
            {t("optionalQuestions")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-city`}>{t("city")}</Label>
              <Input
                id={`${id}-city`}
                value={value.city}
                maxLength={100}
                onChange={(e) => setValue({ ...value, city: e.target.value })}
                autoComplete="address-level2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-languages`}>{t("languages")}</Label>
              <Input
                id={`${id}-languages`}
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                aria-describedby={`${id}-languages-help`}
              />
              <p
                id={`${id}-languages-help`}
                className="text-muted-foreground text-xs"
              >
                {t("languagesHelp")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-meeting`}>{t("meeting")}</Label>
              <Select
                value={value.meeting}
                onValueChange={(meeting) =>
                  setValue({
                    ...value,
                    meeting: meeting as MatchingProfile["meeting"],
                  })
                }
              >
                <SelectTrigger id={`${id}-meeting`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["either", "online", "in_person"] as const).map(
                    (option) => (
                      <SelectItem key={option} value={option}>
                        {t(`meetingOptions.${option}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {active.length === 0 ? (
            <EmptyState
              title={t("noQuestions")}
              description={t("noQuestionsDescription")}
            />
          ) : (
            active.map((type) => {
              const answer = value.answers[type.id] ?? {
                interests: [],
                offering: [],
                seeking: [],
              };
              const fields =
                type.mode === "shared"
                  ? (["interests"] as const)
                  : (["offering", "seeking"] as const);
              return (
                <section key={type.id} className="space-y-4 border-t pt-5">
                  <div>
                    <h3 className="font-medium">{type.name}</h3>
                    {type.description && (
                      <p className="text-muted-foreground mt-1 text-sm">
                        {type.description}
                      </p>
                    )}
                  </div>
                  {fields.map((field) => (
                    <fieldset key={field} className="space-y-3">
                      <legend className="mb-2 text-sm font-medium">
                        {field === "seeking" ? type.promptB : type.promptA}
                      </legend>
                      <div className="flex flex-wrap gap-x-5 gap-y-3">
                        {type.topics.map((topic) => (
                          <label
                            key={topic}
                            className="flex max-w-full cursor-pointer items-center gap-2 text-sm break-words"
                          >
                            <Checkbox
                              tone="ink"
                              checked={answer[field].includes(topic)}
                              onCheckedChange={(checked) =>
                                setValue((current) => ({
                                  ...current,
                                  answers: {
                                    ...current.answers,
                                    [type.id]: {
                                      ...answer,
                                      [field]:
                                        checked === true
                                          ? [...answer[field], topic]
                                          : answer[field].filter(
                                              (v) => v !== topic,
                                            ),
                                    },
                                  },
                                }))
                              }
                            />
                            {topic}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </section>
              );
            })
          )}
        </fieldset>
      )}
      {(invalid || save.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {invalid
            ? t("invalidProfile")
            : save.error?.message === "MATCHING_QUESTIONS_CHANGED"
              ? t("questionsChanged")
              : t("saveFailed")}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("saving") : t("saveProfile")}
      </Button>
    </form>
  );
}
