"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildStartupRoleCopyPrompt,
  type StartupRoleBrief,
} from "@/lib/investigations/startup-role-brief";
import type { StartupLocale } from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

export function StartupsRoleMemberDesk({
  locale,
  brief,
  className,
}: {
  locale: string;
  brief: StartupRoleBrief;
  className?: string;
}) {
  const t = useTranslations("investigationsStartups");
  const copyLocale: StartupLocale = locale === "nl" ? "nl" : "en";
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const utils = api.useUtils();
  const cvQuery = api.startups.getMyCv.useQuery();
  const upsert = api.startups.upsertMyCv.useMutation({
    onSuccess: async () => {
      toast.success(t("cvUploaded"));
      await utils.startups.getMyCv.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? t("cvError"));
    },
  });
  const remove = api.startups.deleteMyCv.useMutation({
    onSuccess: async () => {
      toast.success(t("cvDeleted"));
      await utils.startups.getMyCv.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? t("cvError"));
    },
  });

  const prompt = useMemo(
    () =>
      buildStartupRoleCopyPrompt(brief, {
        locale: copyLocale,
        cvText: cvQuery.data?.textContent ?? null,
      }),
    [brief, copyLocale, cvQuery.data?.textContent],
  );

  async function copyPrompt() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error(t("cvError"));
      return;
    }
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    upsert.mutate({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytesBase64: btoa(binary),
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section
      data-startup-role-member=""
      className={cn(
        "border-border mt-12 flex flex-col gap-8 border-t pt-10",
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          {t("roleBriefTitle")}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("roleBriefLead")}
        </p>
        {brief.seniority ? (
          <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            {t("briefSeniority")} {brief.seniority}
          </p>
        ) : null}
        {brief.languages.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefLanguages")} {brief.languages.join(", ")}
          </p>
        ) : null}
        {brief.mustHaves.length > 0 ? (
          <BriefList label={t("briefMust")} items={brief.mustHaves} />
        ) : null}
        {brief.niceToHaves.length > 0 ? (
          <BriefList label={t("briefNice")} items={brief.niceToHaves} />
        ) : null}
        {brief.mustHaves.length === 0 &&
        brief.niceToHaves.length === 0 &&
        !brief.seniority ? (
          <p className="text-muted-foreground text-sm">{t("roleBriefEmpty")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          {t("copyPromptTitle")}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("copyPromptLead")}
        </p>
        <Textarea
          readOnly
          value={prompt}
          aria-label={t("copyPromptTitle")}
          data-startup-role-prompt=""
          className="min-h-48 font-mono text-xs leading-relaxed"
        />
        <Button
          type="button"
          onClick={() => void copyPrompt()}
          className="w-fit"
        >
          {copied ? t("copyPromptCopied") : t("copyPromptCta")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          {t("cvTitle")}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("cvLead")}
        </p>
        {cvQuery.data ? (
          <p className="text-sm" data-startup-cv-file="">
            {cvQuery.data.fileName}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t("cvEmpty")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            className="sr-only"
            aria-label={cvQuery.data ? t("cvReplace") : t("cvUpload")}
            data-startup-cv-input=""
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={upsert.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {cvQuery.data ? t("cvReplace") : t("cvUpload")}
          </Button>
          {cvQuery.data ? (
            <Button
              type="button"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              {t("cvDelete")}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">{t("cvHelp")}</p>
      </div>
    </section>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {label}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
