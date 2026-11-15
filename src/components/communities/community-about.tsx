"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isStackShown } from "@/server/communities/member-stack";
import { api } from "@/trpc/react";
import { MemberStackView } from "./member-stack";

/**
 * The community's introduction on its Overview: the description and the
 * faces of who is here. It opens the feed's side panel (above the feed on
 * smaller screens). Long descriptions start clamped with a Show more toggle.
 * Nothing at all when there is neither a description nor faces to show.
 */
export function CommunityAbout({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const t = useTranslations("communities.profile");
  const headingId = useId();
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const stack = api.communities.getMemberStack.useQuery({ slug });

  const description = community?.description?.trim() ?? "";
  const faces =
    stack.data && isStackShown(stack.data.faces, stack.data.total)
      ? stack.data
      : null;

  // Wait for the stack before deciding a description-less section is empty,
  // so it never flashes a bare heading.
  if (!description && !faces) return null;

  return (
    <section
      data-community-about=""
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-3", className)}
    >
      <SectionLabel id={headingId}>{t("about")}</SectionLabel>
      {description ? <ClampedText text={description} /> : null}
      {stack.isLoading ? (
        <div className="flex -space-x-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-7 rounded-full" />
          ))}
        </div>
      ) : faces ? (
        <MemberStackView faces={faces.faces} total={faces.total} />
      ) : null}
    </section>
  );
}

/** Plain text kept to six lines, with a toggle only when it is longer. */
function ClampedText({ text }: { text: string }) {
  const t = useTranslations("communities.profile");
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        id={id}
        ref={ref}
        data-community-description=""
        className={cn(
          // Full width so a long link breaks instead of widening the panel.
          "text-muted-foreground w-full text-sm leading-relaxed wrap-break-word whitespace-pre-line",
          !open && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {overflows || open ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          // Ink, not the link variant's orange: the page's one orange is Join.
          className="text-foreground focus-visible:ring-ring/50 min-h-6 rounded-sm py-0.5 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
        >
          {open ? t("showLess") : t("showMore")}
        </button>
      ) : null}
    </div>
  );
}
