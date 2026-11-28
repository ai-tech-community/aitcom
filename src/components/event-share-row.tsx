"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Copy, Check, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface EventShareRowProps {
  slug: string;
  title: string;
  actionsOnly?: boolean;
}

export function EventShareRow({
  slug,
  title,
  actionsOnly = false,
}: EventShareRowProps) {
  const tr = useTranslations("redesign.events");
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : `/events/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("linkCopyFailed"));
    }
  }, [slug]);

  // Defer the URL to after mount: reading window.location during render makes the
  // server (empty) and client (real URL) HTML disagree → hydration mismatch. The
  // first client render matches the server (empty), then this fills it in.
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  const xUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
  const icsUrl = `/api/events/${slug}/ics`;

  if (actionsOnly) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="max-sm:min-h-11"
          onClick={copyLink}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? tr("copied") : tr("copyLink")}
        </Button>
        <Button asChild variant="outline" className="min-h-11 min-w-11">
          <a
            href={xUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={tr("shareX")}
          >
            X
          </a>
        </Button>
        <Button asChild variant="outline" className="min-h-11 min-w-11">
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={tr("shareLinkedIn")}
          >
            <Linkedin aria-hidden="true" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider">
      <a
        href={icsUrl}
        className="border-border hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 transition-colors"
        title="Download .ics file"
      >
        <Calendar className="h-3 w-3" />
        ADD TO CALENDAR
      </a>
      <button
        type="button"
        onClick={copyLink}
        className="border-border hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 transition-colors"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "COPIED" : "COPY LINK"}
      </button>
      <a
        href={xUrl}
        target="_blank"
        rel="noreferrer"
        className="border-border hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 transition-colors"
        title="Share on X"
      >
        <span className="font-semibold">X</span>
      </a>
      <a
        href={linkedInUrl}
        target="_blank"
        rel="noreferrer"
        className="border-border hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 transition-colors"
        title="Share on LinkedIn"
      >
        <Linkedin className="h-3 w-3" />
      </a>
    </div>
  );
}
