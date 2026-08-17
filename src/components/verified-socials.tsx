import { BadgeCheck, Github, Globe, Linkedin } from "lucide-react";

import { cn } from "@/lib/utils";

export type VerifiedSocialItem = {
  handle: string | null;
  url: string | null;
  verified: boolean;
} | null;

type VerifiedSocialsProps = {
  github?: VerifiedSocialItem;
  linkedin?: VerifiedSocialItem;
  websiteUrl?: string | null;
  /** Icon-only row for leaderboard cards. */
  compact?: boolean;
  /** When false, render as non-interactive marks (safe inside a parent link). */
  linked?: boolean;
  className?: string;
  githubLabel?: string;
  linkedinLabel?: string;
  websiteLabel?: string;
  verifiedLabel?: string;
};

function SocialAnchor({
  href,
  label,
  children,
  className,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const classes = cn(
    "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors",
    "focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none",
    className,
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={classes}
      >
        {children}
      </a>
    );
  }

  return (
    <span aria-label={label} className={classes}>
      {children}
    </span>
  );
}

export function VerifiedSocials({
  github,
  linkedin,
  websiteUrl,
  compact = false,
  linked = true,
  className,
  githubLabel = "GitHub",
  linkedinLabel = "LinkedIn",
  websiteLabel = "Website",
  verifiedLabel = "Verified",
}: VerifiedSocialsProps) {
  if (!github && !linkedin && !websiteUrl) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center",
        compact ? "gap-1.5" : "gap-3",
        className,
      )}
    >
      {github && (
        <SocialAnchor
          href={linked ? github.url : null}
          label={
            github.verified
              ? `${githubLabel}${github.handle ? ` @${github.handle}` : ""} (${verifiedLabel})`
              : githubLabel
          }
        >
          <Github className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {!compact && github.handle && (
            <span className="font-mono text-xs tracking-wider">
              @{github.handle}
            </span>
          )}
          {compact && github.handle && (
            <span className="font-mono text-xs tracking-wider">
              @{github.handle}
            </span>
          )}
          {github.verified && (
            <BadgeCheck
              className={cn(
                "text-foreground",
                compact ? "h-3 w-3" : "h-3.5 w-3.5",
              )}
              aria-hidden="true"
            />
          )}
        </SocialAnchor>
      )}
      {linkedin && (
        <SocialAnchor
          href={linked ? linkedin.url : null}
          label={
            linkedin.verified
              ? `${linkedinLabel}${linkedin.handle ? ` ${linkedin.handle}` : ""} (${verifiedLabel})`
              : linkedinLabel
          }
        >
          <Linkedin className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {!compact && linkedin.handle && (
            <span className="font-mono text-xs tracking-wider">
              {linkedin.handle}
            </span>
          )}
          {linkedin.verified && (
            <BadgeCheck
              className={cn(
                "text-foreground",
                compact ? "h-3 w-3" : "h-3.5 w-3.5",
              )}
              aria-hidden="true"
            />
          )}
        </SocialAnchor>
      )}
      {websiteUrl && (
        <SocialAnchor href={linked ? websiteUrl : null} label={websiteLabel}>
          <Globe className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </SocialAnchor>
      )}
    </div>
  );
}
