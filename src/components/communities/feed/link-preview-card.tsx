"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

import type { LinkPreviewMeta } from "@/lib/link-preview";
import { USER_LINK_REL } from "./linkified-text";

/** The address as people read it: host and path, no scheme or trailing slash. */
function readableAddress(href: string): { host: string; address: string } {
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");
  const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
  return { host, address: `${host}${path}` };
}

/**
 * A post's first link as a clickable card that opens the page in a new tab.
 * With the page's preview it shows its image, title, and description; without
 * one (the page blocked us, or the post predates previews) it still shows the
 * site and address, so the link is always easy to open.
 */
export function LinkPreviewCard({
  href,
  preview,
}: {
  href: string;
  preview: Partial<LinkPreviewMeta> | null;
}) {
  const t = useTranslations("communities.feed");
  const [imageFailed, setImageFailed] = useState(false);
  const { host, address } = readableAddress(href);
  const title = preview?.title ?? null;
  const imageUrl = imageFailed ? null : (preview?.imageUrl ?? null);

  return (
    <a
      href={href}
      target="_blank"
      rel={USER_LINK_REL}
      className="group border-border hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 block overflow-hidden rounded-lg border transition-colors outline-none focus-visible:ring-[3px]"
    >
      {imageUrl ? (
        // A remote page's image: hotlinked without a referrer, hidden if it fails.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="border-border bg-muted aspect-[1.91/1] max-h-72 w-full border-b object-cover"
        />
      ) : null}
      <div className="space-y-1 px-3 py-2.5">
        <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{host}</span>
        </p>
        <p className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere] underline-offset-4 group-hover:underline">
          {title ?? address}
        </p>
        {preview?.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
            {preview.description}
          </p>
        ) : null}
      </div>
      <span className="sr-only"> ({t("linkOpensInNewTab")})</span>
    </a>
  );
}
