import {
  formatCheckedAt,
  httpsSourceUrl,
} from "@/lib/investigations/datacenter-facilities";

export function FacilityProvenance({
  sourceUrl,
  checkedAt,
}: {
  sourceUrl: string | null;
  checkedAt: Date | string | null;
}) {
  const href = httpsSourceUrl(sourceUrl);
  if (!href) return null;
  const checked = formatCheckedAt(checkedAt);
  const dateTime =
    checkedAt instanceof Date
      ? checkedAt.toISOString()
      : checkedAt
        ? new Date(checkedAt).toISOString()
        : null;
  return (
    <p className="text-muted-foreground flex flex-wrap items-baseline gap-2 text-sm">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all underline"
      >
        {href}
      </a>
      {checked && dateTime && !Number.isNaN(new Date(dateTime).getTime()) ? (
        <time dateTime={dateTime} className="font-mono text-xs">
          {checked}
        </time>
      ) : null}
    </p>
  );
}
