"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  displayStartupFounders,
  startupFounderInitials,
  type StartupFounder,
} from "@/lib/investigations/startups";

const SHOWN = 3;

export function StartupsFounders({
  founders,
  label,
}: {
  founders: readonly StartupFounder[];
  label: string;
}) {
  const sourced = displayStartupFounders(founders);
  if (sourced.length === 0) return null;

  const shown = sourced.slice(0, SHOWN);
  const overflow = sourced.length - shown.length;

  return (
    <div data-startup-founders="" className="flex flex-col gap-2">
      <p className="text-foreground text-sm font-medium">{label}</p>
      <AvatarGroup aria-label={label}>
        {shown.map((founder) => (
          <Avatar
            key={`${founder.name}-${founder.url ?? ""}`}
            size="sm"
            className="cursor-default"
            aria-label={founder.name}
            data-startup-founder-photo={founder.imageUrl ?? undefined}
          >
            {founder.imageUrl ? (
              <AvatarImage src={founder.imageUrl} alt="" />
            ) : null}
            <AvatarFallback>
              {startupFounderInitials(founder.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 ? (
          <AvatarGroupCount aria-label={`+${overflow}`}>
            +{overflow}
          </AvatarGroupCount>
        ) : null}
      </AvatarGroup>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {sourced.map((founder) => (
          <li key={`${founder.name}-${founder.url ?? ""}`}>
            {founder.url ? (
              <a
                href={founder.url}
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
              >
                {founder.name}
              </a>
            ) : (
              <span className="text-muted-foreground text-sm">
                {founder.name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
