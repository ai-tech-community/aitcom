"use client";

import * as React from "react";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { parseAddress } from "@/lib/collectors/address";
import { startHref } from "@/lib/collectors/start-address";
import { api } from "@/trpc/react";

type Problem = "invalid" | "noPreset" | "failed";

/** Not translated: an address looks the same in every language. */
const PLACEHOLDER = "https://example.com/jobs";

/**
 * The rail's paste box: an address in, the matching preset's start page out
 * (pre-filled). Text that is not an address never leaves the browser; the
 * server checks again and never fetches the address.
 */
export function PasteBox() {
  const t = useTranslations("collectors.workspace.paste");
  const router = useRouter();
  const utils = api.useUtils();
  const pending = React.useRef(false);
  const [text, setText] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  // Bumped on every report, so the alert remounts and a repeated problem is
  // announced again (a same-text update is silent for screen readers).
  const [reports, setReports] = React.useState(0);
  const id = React.useId();

  function report(next: Problem) {
    setProblem(next);
    setReports((n) => n + 1);
  }

  async function open(address: string) {
    if (pending.current) return;
    if (!parseAddress(address)) {
      report("invalid");
      return;
    }
    setProblem(null);
    pending.current = true;
    setChecking(true);
    try {
      const result = await utils.collectors.recognize.fetch({ address });
      if (!result.ok) {
        report(result.reason === "not_an_address" ? "invalid" : "noPreset");
        return;
      }
      setText("");
      router.push(
        startHref(result.presetId, {
          prefill: result.prefill,
          recognised: result.matched,
        }),
      );
    } catch {
      report("failed");
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void open(text);
      }}
    >
      <Label htmlFor={id}>{t("label")}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          value={text}
          aria-invalid={problem === "invalid" || undefined}
          aria-describedby={problem ? `${id}-problem` : `${id}-help`}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            // A paste into an empty box is the whole address: go at once.
            if (text.trim() === "" && pasted.trim() !== "") {
              e.preventDefault();
              setText(pasted);
              void open(pasted);
            }
          }}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={t("submit")}
          // Not `disabled`: that would drop a keyboard user's focus. The
          // pending ref already ignores a second submit.
          aria-disabled={checking || undefined}
          className="aria-disabled:cursor-progress aria-disabled:opacity-50"
        >
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
      {problem ? (
        <p
          key={reports}
          id={`${id}-problem`}
          role="alert"
          className="text-destructive text-[13px]"
        >
          {t(problem)}
        </p>
      ) : null}
      {/* One polite region, always mounted: only its text changes, so
          "Checking the link…" is announced reliably. */}
      <p
        id={`${id}-help`}
        role="status"
        className="text-muted-foreground text-[13px]"
      >
        {checking ? t("checking") : problem ? null : t("help")}
      </p>
    </form>
  );
}
