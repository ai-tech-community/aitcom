"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { builderControl } from "./builder-ui";

function BuilderCopy({ value, label }: { value: string; label: string }) {
  const t = useTranslations("redesign.builder");
  const [feedback, setFeedback] = useState<{
    value: string;
    copied: boolean;
  }>();
  const currentFeedback = feedback?.value === value ? feedback : undefined;

  useEffect(() => {
    if (!currentFeedback?.copied) return;
    const timer = setTimeout(() => setFeedback(undefined), 2000);
    return () => clearTimeout(timer);
  }, [currentFeedback]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ value, copied: true });
    } catch {
      setFeedback({ value, copied: false });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={builderControl}
        aria-label={t("copyLabel", { label })}
        onClick={() => void copy()}
      >
        <span aria-hidden className="grid">
          <span
            className={`col-start-1 row-start-1 flex items-center gap-2 motion-safe:transition-opacity ${currentFeedback?.copied ? "opacity-0" : "opacity-100"}`}
          >
            <CopyIcon /> {t("copy")}
          </span>
          <span
            className={`col-start-1 row-start-1 flex items-center gap-2 motion-safe:transition-opacity ${currentFeedback?.copied ? "opacity-100" : "opacity-0"}`}
          >
            <CheckIcon /> {t("copied")}
          </span>
        </span>
      </Button>
      <span
        role="status"
        className={
          currentFeedback?.copied === false
            ? "text-destructive text-xs"
            : "sr-only"
        }
      >
        {currentFeedback && t(currentFeedback.copied ? "copied" : "copyFailed")}
      </span>
    </div>
  );
}

export function BuilderCode({
  label,
  value,
  maskKey,
  controls,
  id,
}: {
  label: string;
  value: string;
  maskKey?: string;
  controls?: ReactNode;
  id?: string;
}) {
  return (
    <div className="border-border min-w-0 rounded-lg border">
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-muted-foreground font-mono text-xs">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <BuilderCopy value={value} label={label} />
        </div>
      </div>
      <pre
        id={id}
        className="bg-muted/55 min-w-0 rounded-b-lg p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap"
      >
        <code>
          {maskKey?.startsWith("ait_sk_")
            ? value.replaceAll(maskKey, "ait_sk_••••••••••••••••••••••••")
            : value}
        </code>
      </pre>
    </div>
  );
}

export function BuilderNewKey({ value }: { value: string }) {
  const t = useTranslations("redesign.builder.key");
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <BuilderCode
      id={id}
      label={t("title")}
      value={value}
      maskKey={show ? undefined : value}
      controls={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={builderControl}
          aria-controls={id}
          aria-expanded={show}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
          {t(show ? "hide" : "show")}
        </Button>
      }
    />
  );
}
