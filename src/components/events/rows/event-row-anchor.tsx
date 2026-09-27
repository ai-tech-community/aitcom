import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { EventRowLink } from "./event-rows";

/**
 * The element a row's body renders as, chosen by where the row goes: the
 * locale-aware `Link` for a page on this site, a new-tab anchor for a page
 * elsewhere (a live Luma listing), or a plain block when the row has no
 * page (a draft). `linkClassName` holds what only a link needs (hover bed,
 * focus ring), so an unlinked row never looks clickable.
 */
export function EventRowAnchor({
  link,
  className,
  linkClassName,
  children,
  ...data
}: {
  link: EventRowLink | null;
  className: string;
  linkClassName: string;
  children: ReactNode;
} & Partial<Record<`data-${string}`, string | boolean>>) {
  const t = useTranslations("events");
  if (!link) {
    return (
      <div className={className} {...data}>
        {children}
      </div>
    );
  }
  if (link.kind === "external") {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(className, linkClassName)}
        {...data}
      >
        {children}
        {/* Added after the visible words, never instead of them. */}
        <span className="sr-only"> ({t("opensInNewTab")})</span>
      </a>
    );
  }
  return (
    <Link href={link.href} className={cn(className, linkClassName)} {...data}>
      {children}
    </Link>
  );
}
