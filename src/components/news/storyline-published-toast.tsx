"use client";

import { toast } from "sonner";

import { Link } from "@/i18n/navigation";

/** Confirmation that approval published the story, with a link to read it. */
export function announcePublishedStory(
  message: string,
  slug: string,
  linkLabel: string,
) {
  toast.success(message, {
    description: (
      <Link
        href={`/news/stories/${encodeURIComponent(slug)}` as never}
        className="font-medium underline underline-offset-4"
      >
        {linkLabel}
      </Link>
    ),
  });
}
