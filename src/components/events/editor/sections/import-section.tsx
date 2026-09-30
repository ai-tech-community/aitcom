"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorSection, Field } from "../editor-layout";
import { applyImport } from "../event-form-model";
import type { SectionProps } from "./types";

/** New events only: paste a Luma/Meetup link and the form fills itself. */
export function ImportSection({
  form,
  update,
  communitySlug,
}: SectionProps & { communitySlug: string }) {
  const t = useTranslations("events");
  const te = useTranslations("events.editor");
  const [url, setUrl] = useState("");
  const importLink = api.events.importEventFromUrl.useMutation({
    onSuccess: (data) => {
      update(applyImport(form, data));
      toast.success(t("eventImported"));
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <EditorSection
      id="import"
      title={te("sections.import")}
      description={t("importHint")}
    >
      <Field id="event-import-url" label={t("importFromLink")} wide>
        <div className="flex gap-2">
          <Input
            id="event-import-url"
            type="url"
            placeholder="https://lu.ma/your-event"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!url || importLink.isPending}
            onClick={() => importLink.mutate({ communitySlug, url })}
          >
            {importLink.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {importLink.isPending ? t("importing") : t("importAction")}
          </Button>
        </div>
      </Field>
    </EditorSection>
  );
}
