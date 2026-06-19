"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Copy, Check, Linkedin } from "lucide-react";
import { toast } from "sonner";

interface EventShareRowProps {
  slug: string;
  title: string;
}

export function EventShareRow({ slug, title }: EventShareRowProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : `/events/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link.");
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
