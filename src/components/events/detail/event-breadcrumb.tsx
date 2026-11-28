import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

type Community = { name: string; slug: string };

const linkClass =
  "focus-visible:ring-ring/50 hover:text-foreground inline-flex min-h-11 min-w-0 items-center rounded outline-none underline-offset-4 hover:underline focus-visible:ring-[3px]";

export function EventBreadcrumb({
  community,
  title,
  eventHref,
  leaf,
}: {
  community?: Community | null;
  title: string;
  eventHref?: string;
  leaf?: string | null;
}) {
  const t = useTranslations("redesign.events");
  const communityHref = community ? `/communities/${community.slug}` : null;
  return (
    <nav
      aria-label={t("eventBreadcrumb")}
      className="text-muted-foreground mb-1 text-sm sm:mb-3"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2">
        {community && communityHref ? (
          <li className="flex min-w-0 items-center gap-2">
            <Link href={communityHref} className={linkClass}>
              <span className="max-w-[44vw] truncate sm:max-w-64">
                {community.name}
              </span>
            </Link>
            <span aria-hidden="true">/</span>
          </li>
        ) : null}
        <li className="flex shrink-0 items-center gap-2">
          <Link
            href={communityHref ? `${communityHref}/events` : "/events"}
            className={linkClass}
          >
            {t(communityHref ? "title" : "backEvents")}
          </Link>
          <span aria-hidden="true">/</span>
        </li>
        <li className="min-w-0 truncate">
          {leaf && eventHref ? (
            <Link href={eventHref} className={linkClass}>
              <span className="truncate">{title}</span>
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground">
              {title}
            </span>
          )}
        </li>
        {leaf ? (
          <li
            className="text-foreground flex min-w-0 items-center gap-2"
            aria-current="page"
          >
            <span aria-hidden="true">/</span>
            <span className="truncate">{leaf}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
