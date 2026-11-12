"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  connectionTypeInput,
  type ConnectionType,
} from "@/lib/communities/matching";

const templates = [
  "business",
  "mentorship",
  "collaboration",
  "hobbies",
  "local",
  "accountability",
] as const;
type Template = (typeof templates)[number];

export function ConnectionTypeEditor({
  slug,
  types,
}: {
  slug: string;
  types: ConnectionType[];
}) {
  const t = useTranslations("communityMatching");
  const id = useId();
  const utils = api.useUtils();
  const blank = {
    name: "",
    description: "",
    mode: "shared" as "shared" | "complementary",
    promptA: t("defaultSharedPrompt"),
    promptB: "",
    topics: [] as string[],
  };
  const [editing, setEditing] = useState<string>();
  const [value, setValue] = useState(blank);
  const [options, setOptions] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [template, setTemplate] = useState<string>("custom");
  const invalidate = () => {
    void utils.communityMatching.setup.invalidate({ slug });
    void utils.communityMatching.suggestions.invalidate({ slug });
  };
  const reset = () => {
    setEditing(undefined);
    setValue(blank);
    setOptions("");
    setTemplate("custom");
    setInvalid(false);
  };
  const save = api.communityMatching.saveType.useMutation({
    onSuccess: () => {
      reset();
      invalidate();
      toast.success(t("typeSaved"));
    },
  });
  const archive = api.communityMatching.archiveType.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error(t("saveFailed")),
  });
  const useTemplate = (key: string) => {
    setTemplate(key);
    if (key === "custom") {
      setValue(blank);
      setOptions("");
      return;
    }
    const chosen = key as Template;
    const mode = ["hobbies", "local", "accountability"].includes(chosen)
      ? "shared"
      : "complementary";
    setValue({
      name: t(`templates.${chosen}.name`),
      description: t(`templates.${chosen}.description`),
      mode,
      promptA: t(`templates.${chosen}.promptA`),
      promptB: mode === "complementary" ? t("defaultSeekingPrompt") : "",
      topics: [],
    });
    setOptions(t(`templates.${chosen}.topics`));
  };
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("typesTitle")}</h2>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          {t("typesDescription")}
        </p>
      </div>
      {types.length > 0 && (
        <ul className="divide-y border-y">
          {types.map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium break-words">
                  {type.name}
                </span>
                {!type.active && (
                  <Badge variant="secondary" className="ms-2">
                    {t("archived")}
                  </Badge>
                )}
                <p className="text-muted-foreground text-xs">
                  {t(`modes.${type.mode}`)} ·{" "}
                  {t("topicCount", { count: type.topics.length })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={save.isPending || archive.isPending}
                  onClick={() => {
                    setEditing(type.id);
                    setValue(type);
                    setOptions(type.topics.join(", "));
                    setInvalid(false);
                    document.getElementById(`${id}-name`)?.focus();
                  }}
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={save.isPending || archive.isPending}
                  onClick={() =>
                    archive.mutate({ slug, id: type.id, active: !type.active })
                  }
                >
                  {type.active ? t("archive") : t("restore")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = connectionTypeInput.safeParse({
            ...value,
            id: editing,
            topics: options
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          });
          setInvalid(!parsed.success);
          if (parsed.success) save.mutate({ slug, type: parsed.data });
        }}
      >
        <h3 className="font-medium">
          {editing ? t("editType") : t("newType")}
        </h3>
        <fieldset disabled={save.isPending} className="space-y-5">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-template`}>{t("startFromTemplate")}</Label>
              <Select value={template} onValueChange={useTemplate}>
                <SelectTrigger id={`${id}-template`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{t("customType")}</SelectItem>
                  {templates.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`templates.${key}.name`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>{t("typeName")}</Label>
            <Input
              required
              maxLength={80}
              id={`${id}-name`}
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-description`}>{t("typeDescription")}</Label>
            <Textarea
              maxLength={500}
              id={`${id}-description`}
              value={value.description}
              onChange={(e) =>
                setValue({ ...value, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-mode`}>{t("matchingMode")}</Label>
            <Select
              disabled={!!editing}
              value={value.mode}
              onValueChange={(mode) =>
                setValue({
                  ...value,
                  mode: mode as ConnectionType["mode"],
                  promptA: t(
                    mode === "shared"
                      ? "defaultSharedPrompt"
                      : "defaultOfferingPrompt",
                  ),
                  promptB:
                    mode === "complementary" ? t("defaultSeekingPrompt") : "",
                })
              }
            >
              <SelectTrigger id={`${id}-mode`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">{t("modes.shared")}</SelectItem>
                <SelectItem value="complementary">
                  {t("modes.complementary")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t(editing ? "modeLocked" : "modeHelp")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-a`}>
              {t(
                value.mode === "shared" ? "sharedQuestion" : "offeringQuestion",
              )}
            </Label>
            <Input
              required
              maxLength={160}
              id={`${id}-a`}
              value={value.promptA}
              onChange={(e) => setValue({ ...value, promptA: e.target.value })}
            />
          </div>
          {value.mode === "complementary" && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-b`}>{t("seekingQuestion")}</Label>
              <Input
                required
                maxLength={160}
                id={`${id}-b`}
                value={value.promptB}
                onChange={(e) =>
                  setValue({ ...value, promptB: e.target.value })
                }
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${id}-topics`}>{t("topicOptions")}</Label>
            <Textarea
              required
              id={`${id}-topics`}
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              aria-describedby={`${id}-topics-help`}
            />
            <p
              id={`${id}-topics-help`}
              className="text-muted-foreground text-xs"
            >
              {t("topicsHelp")}
            </p>
          </div>
        </fieldset>
        {(invalid || save.isError) && (
          <p role="alert" className="text-destructive text-sm">
            {invalid
              ? t("invalidType")
              : save.error?.message === "MATCHING_TYPE_LIMIT"
                ? t("typeLimit")
                : t("saveFailed")}
          </p>
        )}
        <div className="flex gap-2">
          <Button disabled={save.isPending || archive.isPending} type="submit">
            {save.isPending ? t("saving") : t("saveType")}
          </Button>
          {editing && (
            <Button variant="ghost" type="button" onClick={reset}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
