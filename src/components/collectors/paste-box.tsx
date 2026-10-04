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
  const id = React.useId();

  async function open(address: string) {
    if (pending.current) return;
    setProblem(null);
    if (!parseAddress(address)) {
      setProblem("invalid");
      return;
    }
    pending.current = true;
    setChecking(true);
    try {
      const result = await utils.collectors.recognize.fetch({ address });
      if (!result.ok) {
        setProblem(result.reason === "not_an_address" ? "invalid" : "noPreset");
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
      setProblem("failed");
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
          disabled={checking}
        >
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
      {problem ? (
        <p
          id={`${id}-problem`}
          role="alert"
          className="text-destructive text-[13px]"
        >
          {t(problem)}
        </p>
      ) : (
        <p
          id={`${id}-help`}
          className="text-muted-foreground text-[13px]"
          aria-live="polite"
        >
          {checking ? t("checking") : t("help")}
        </p>
      )}
    </form>
  );
}
