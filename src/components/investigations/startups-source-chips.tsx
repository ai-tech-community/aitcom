import { Badge } from "@/components/ui/badge";
import {
  displayStartupSourceChips,
  startupSourceFaviconUrl,
  type StartupLocale,
} from "@/lib/investigations/startups";

export function StartupsSourceChips({
  sources,
  locale,
  label,
}: {
  sources: readonly string[];
  locale: StartupLocale;
  label?: string;
}) {
  const chips = displayStartupSourceChips(sources, locale);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <p className="text-foreground text-sm font-medium">{label}</p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li key={chip.href}>
            <Badge asChild variant="outline">
              <a
                href={chip.href}
                rel="noopener noreferrer"
                data-startup-source-chip={chip.label}
                className="inline-flex items-center gap-1.5"
              >
                <SourceChipFavicon href={chip.href} />
                {chip.label}
              </a>
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceChipFavicon({ href }: { href: string }) {
  const src = startupSourceFaviconUrl(href);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={12}
      height={12}
      data-startup-source-favicon={src}
      className="size-3 rounded-sm"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}
