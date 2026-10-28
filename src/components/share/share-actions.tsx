"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { shareTargets } from "@/lib/share";

/** Page sharing, with a first render that matches the server's HTML. */
export function ShareActions({
  title,
  url,
  social,
}: {
  title: string;
  url: string;
  social: boolean;
}) {
  const t = useTranslations("share");
  const [nativeShare, setNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNativeShare(typeof navigator.share === "function");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus(t("linkCopied"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setStatus("");
      }, 2000);
    } catch {
      setStatus(t("linkCopyFailed"));
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus(t("shareFailed"));
    }
  }

  const destinations = shareTargets(url, title);
  const targets = [
    { name: "x", href: destinations.x, opensInNewTab: true },
    { name: "linkedIn", href: destinations.linkedIn, opensInNewTab: true },
    { name: "email", href: destinations.email, opensInNewTab: false },
  ] as const;
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
          {targets.map(({ name, href, opensInNewTab }) => (
            <Button key={name} variant="ghost" size="sm" asChild>
              <a
                href={href}
                target={opensInNewTab ? "_blank" : undefined}
                rel={opensInNewTab ? "noopener noreferrer" : undefined}
              >
                {t(name)}
                {opensInNewTab && (
                  <>
                    {" "}
                    <span className="sr-only">{t("opensInNewTab")}</span>
                  </>
                )}
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
