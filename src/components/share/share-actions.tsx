"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shareTargets } from "@/lib/share";

/** Page sharing, with a first render that matches the server's HTML. */
export function ShareActions({
  title,
  social,
}: {
  title: string;
  social: boolean;
}) {
  const t = useTranslations("share");
  const [url, setUrl] = useState("");
  const [nativeShare, setNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reading location during render causes a server/client hydration mismatch.
    setUrl(window.location.href);
    setNativeShare(typeof navigator.share === "function");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setStatus(t("linkCopied"));
      toast.success(t("linkCopied"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setStatus("");
      }, 2000);
    } catch {
      setStatus(t("linkCopyFailed"));
      toast.error(t("linkCopyFailed"));
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus(t("shareFailed"));
      toast.error(t("shareFailed"));
    }
  }

  const targets = shareTargets(url, title);
  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-2"
    >
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {t("copyLink")}
      </Button>
      {social && (
        <>
          {nativeShare && (
            <Button type="button" variant="outline" size="sm" onClick={share}>
              <Share2 aria-hidden="true" />
              {t("nativeShare")}
            </Button>
          )}
          {(["x", "linkedIn", "email"] as const).map((target) => (
            <Button key={target} variant="ghost" size="sm" asChild>
              <a
                href={targets[target]}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(target)}{" "}
                <span className="sr-only">{t("opensInNewTab")}</span>
              </a>
            </Button>
          ))}
        </>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
