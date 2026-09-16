"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  STARTUPS_FOUNDERS_SHOWN,
  displayStartupFounders,
  startupFounderInitials,
  type StartupFounder,
} from "@/lib/investigations/startups";

export function StartupsFounders({
  founders,
  label,
  compact = false,
}: {
  founders: readonly StartupFounder[];
  label: string;
  compact?: boolean;
}) {
  const sourced = displayStartupFounders(founders);
  if (sourced.length === 0) return null;

  const shown = sourced.slice(0, STARTUPS_FOUNDERS_SHOWN);
  const overflow = sourced.length - shown.length;

  return (
    <div
      data-startup-founders=""
      className={compact ? "flex flex-col gap-1.5" : "flex flex-col gap-2"}
    >
      {compact ? null : (
        <p className="text-foreground text-sm font-medium">{label}</p>
      )}
      <AvatarGroup aria-label={label}>
        {shown.map((founder) => {
          const avatar = (
            <Avatar
              size="sm"
              className={founder.url ? "cursor-pointer" : "cursor-default"}
              aria-label={founder.name}
              title={founder.name}
              data-startup-founder-photo={founder.imageUrl ?? undefined}
            >
              {founder.imageUrl ? (
                <AvatarImage src={founder.imageUrl} alt={founder.name} />
              ) : null}
              <AvatarFallback>
                {startupFounderInitials(founder.name)}
              </AvatarFallback>
            </Avatar>
          );
          return founder.url ? (
            <a
              key={`${founder.name}-${founder.url}`}
              href={founder.url}
              rel="noopener noreferrer"
              title={founder.name}
              data-startup-founder-hover={founder.url}
              aria-label={founder.name}
            >
              {avatar}
            </a>
          ) : (
            <span key={`${founder.name}-`} title={founder.name}>
              {avatar}
            </span>
          );
        })}
        {overflow > 0 ? (
          <AvatarGroupCount aria-label={`+${overflow}`}>
            +{overflow}
          </AvatarGroupCount>
        ) : null}
      </AvatarGroup>
      <ul
        data-startup-founder-ssr=""
        className="flex flex-wrap gap-x-3 gap-y-1"
      >
        {sourced.map((founder) => (
          <li
            key={`${founder.name}-${founder.url ?? ""}`}
            data-startup-founder-name={founder.name}
          >
            {founder.url ? (
              <a
                href={founder.url}
                rel="noopener noreferrer"
                data-startup-founder-profile={founder.url}
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
