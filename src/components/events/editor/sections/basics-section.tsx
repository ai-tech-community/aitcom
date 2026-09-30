"use client";

import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import type { EventType } from "@/lib/event-metadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EditorSection, Field } from "../editor-layout";
import { useCoverUpload } from "../use-cover-upload";
import type { SectionProps } from "./types";

const TYPES: { value: EventType; key: string }[] = [
  { value: "meetup", key: "eventTypeMeetup" },
  { value: "workshop", key: "eventTypeWorkshop" },
  { value: "hackathon", key: "eventTypeHackathon" },
  { value: "deep_dive", key: "eventTypeDeepDive" },
];

/** What the event is: name, kind, words, picture. */
export function BasicsSection({ form, update }: SectionProps) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const tc = useTranslations("common");
  const cover = useCoverUpload({
    alt: form.title || t("eventCoverAlt"),
    onUploaded: (media) =>
      update({ coverImageId: media.id, coverImageUrl: media.url }),
    onError: () => toast.error(tc("imageUploadFailed")),
  });

  return (
    <EditorSection
      id="basics"
      title={te("sections.basics")}
      description={te("sections.basicsHint")}
    >
      <Field id="event-title" label={t("eventTitle")} wide>
        <Input
          id="event-title"
          value={form.title}
          onChange={(e) => update({ title: e.target.value })}
          required
          minLength={3}
          maxLength={255}
        />
      </Field>
      <Field id="event-type" label={t("eventType")}>
        <Select
          value={form.type}
          onValueChange={(v) => update({ type: v as EventType })}
        >
          <SelectTrigger id="event-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map(({ value, key }) => (
              <SelectItem key={value} value={value}>
                {t(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="hidden sm:block" />
      <Field id="event-summary" label={t("eventSummary")} wide>
        <Textarea
          id="event-summary"
          value={form.summary}
          onChange={(e) => update({ summary: e.target.value })}
          rows={2}
          maxLength={1000}
        />
      </Field>
      <Field id="event-description" label={t("eventDescription")} wide>
        <Textarea
          id="event-description"
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={6}
          maxLength={5000}
        />
      </Field>
      <Field label={t("coverImageLabel")}>
        {form.coverImageUrl ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.coverImageUrl}
              alt={t("coverPreviewAlt")}
              className="border-border h-28 rounded-lg border object-cover"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={te("removeCover")}
              className="bg-background/90 absolute top-1 right-1 size-7 rounded-full"
              onClick={() =>
                update({ coverImageId: null, coverImageUrl: null })
              }
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cover.uploading}
              onClick={cover.pick}
            >
              {cover.uploading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
              {cover.uploading ? t("uploading") : t("uploadCoverImage")}
            </Button>
          </div>
        )}
        <input
          ref={cover.inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={cover.onChange}
        />
      </Field>
      <Field id="event-video" label={t("videoUrlLabel")}>
        <Input
          id="event-video"
          type="url"
          value={form.videoUrl}
          onChange={(e) => update({ videoUrl: e.target.value })}
          placeholder="https://youtube.com/..."
        />
      </Field>
    </EditorSection>
  );
}
