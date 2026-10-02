import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type {
  BadgeSlug,
  LimitedEditionBadge,
  MilestoneBadge,
} from "@/lib/badges/catalog";
import {
  SHOWCASE_LIMIT,
  sameBadgeLine,
  type Showcase,
} from "@/lib/badges/showcase";
import type { BadgeRarityReport } from "@/server/badges/rarity";
import type { ProfileAward } from "@/server/members/profile-awards";
import {
  BadgeEmblem,
  type EmblemState,
} from "@/components/badges/badge-emblem";
import { useEmblemLabel } from "@/components/badges/use-emblem-label";
import { useRarityLabel } from "@/components/badges/use-rarity-label";

import {
  groupBadges,
  isBeingAdded,
  type BadgeViewer,
  type HeldBadge,
  type SingleEntry,
  type TierEntry,
  type TrackGroup,
} from "./badge-groups";
import { ShowcasePinButton } from "./showcase-pin-button";

const SHOWCASE_HINT_ID = "badge-showcase-hint";

const DATE_FORMAT = {
  day: "numeric",
  month: "short",
  year: "numeric",
} as const;

function emblemState(entry: {
  earnedAt: Date | string | null;
  progress?: TierEntry["progress"];
}): EmblemState {
  return entry.earnedAt !== null
    ? { earned: true, earnedAt: entry.earnedAt }
    : { earned: false, progress: entry.progress ?? undefined };
}

/** What the owner's pin control needs; null for a visitor. */
interface PinContext {
  showcase: Showcase;
  full: boolean;
}

function pinnedSlugFor(pins: PinContext, slug: BadgeSlug): string | null {
  if (pins.showcase.source !== "pinned") return null;
  return pins.showcase.slugs.find((s) => sameBadgeLine(s, slug)) ?? null;
}

function GroupHeading({
  children,
  count,
}: {
  children: string;
  count: number;
}) {
  return (
    <h3 className="flex items-baseline gap-2 text-sm font-medium">
      {children}
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {count}
      </span>
    </h3>
  );
}

/** One line of quiet facts: earned date, rarity. Mono: they are data. */
function Facts({ items }: { items: (string | null)[] }) {
  const shown = items.filter((item): item is string => Boolean(item));
  if (shown.length === 0) return null;
  return (
    <p className="text-muted-foreground font-mono text-xs">
      {shown.join(" · ")}
    </p>
  );
}

/**
 * A member's Badges tab (ADR-0039): earned badges grouped by kind, each
 * with its date and rarity. The owner also sees every locked tier with
 * progress, and pins badges to the Overview showcase. A visitor's view is
 * built from earned badges only.
 */
export function BadgesTab({
  held,
  awards,
  rarity,
  viewer,
  showcase,
}: {
  held: readonly HeldBadge[];
  awards: readonly ProfileAward[];
  rarity: BadgeRarityReport | null;
  viewer: BadgeViewer;
  showcase: Showcase;
}) {
  const t = useTranslations("memberProfile.badges");
  const tBadges = useTranslations("badges");
  const format = useFormatter();
  const rarityOf = useRarityLabel(rarity);
  const emblemLabel = useEmblemLabel();
  const groups = groupBadges(held, viewer);
  const owner = viewer.kind === "owner";

  const pinnedCount = showcase.source === "pinned" ? showcase.slugs.length : 0;
  const pins: PinContext | null = owner
    ? { showcase, full: pinnedCount >= SHOWCASE_LIMIT }
    : null;

  const earnedOn = (earnedAt: Date | string | null, beingAdded = false) =>
    earnedAt === null
      ? beingAdded
        ? t("beingAddedFact")
        : t("notEarned")
      : t("earnedOn", {
          date: format.dateTime(new Date(earnedAt), DATE_FORMAT),
        });

  const pinControl = (slug: BadgeSlug, name: string, earned: boolean) =>
    pins && earned ? (
      <ShowcasePinButton
        slug={slug}
        pinnedSlug={pinnedSlugFor(pins, slug)}
        full={pins.full}
        hintId={SHOWCASE_HINT_ID}
        badgeName={name}
      />
    ) : null;

  const trackRow = (group: TrackGroup) => {
    const { lead } = group;
    const name = tBadges(lead.badge.nameKey);
    const earned = lead.earnedAt !== null;
    const others = group.tiers.filter((tier) => tier !== lead);
    const nextLocked = group.tiers.find(
      (tier) => tier.earnedAt === null && tier.progress,
    );
    return (
      <li
        key={group.track}
        data-track={group.track}
        className="border-border flex gap-4 border-t py-5"
      >
        <BadgeEmblem
          subject={{ kind: "badge", slug: lead.badge.slug }}
          state={emblemState(lead)}
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{name}</p>
              <p className="text-muted-foreground text-sm">
                {tBadges(
                  lead.badge.descriptionKey,
                  lead.badge.descriptionValues,
                )}
              </p>
            </div>
            {pinControl(lead.badge.slug, name, earned)}
          </div>
          <Facts
            items={[
              earnedOn(lead.earnedAt, isBeingAdded(lead)),
              earned ? rarityOf(lead.badge.slug) : null,
            ]}
          />
          {others.length > 0 && (
            <ul
              aria-label={t("otherTiers", {
                track: tBadges(`tracks.${group.track}`),
              })}
              className="flex items-center gap-2 pt-1"
            >
              {others.map((tier) => (
                <li key={tier.badge.slug} className="flex">
                  <BadgeEmblem
                    subject={{ kind: "badge", slug: tier.badge.slug }}
                    state={emblemState(tier)}
                    size="sm"
                    label={emblemLabel(
                      { kind: "badge", slug: tier.badge.slug },
                      emblemState(tier),
                    )}
                  />
                </li>
              ))}
            </ul>
          )}
          {owner && nextLocked?.progress && (
            <p className="text-sm" data-testid="track-next">
              {t("next", {
                name: tBadges(nextLocked.badge.nameKey),
                progress: isBeingAdded(nextLocked)
                  ? t("beingAdded")
                  : tBadges(`progress.${group.track}`, {
                      current: nextLocked.progress.current,
                      count: nextLocked.progress.threshold,
                    }),
              })}
            </p>
          )}
        </div>
      </li>
    );
  };

  const singleRow = (
    entry: SingleEntry<MilestoneBadge | LimitedEditionBadge>,
  ) => {
    const name = tBadges(entry.badge.nameKey);
    const earned = entry.earnedAt !== null;
    return (
      <li
        key={entry.badge.slug}
        data-badge={entry.badge.slug}
        className="border-border flex gap-4 border-t py-4"
      >
        <BadgeEmblem
          subject={{ kind: "badge", slug: entry.badge.slug }}
          state={emblemState(entry)}
          size="md"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{name}</p>
              <p className="text-muted-foreground text-sm">
                {tBadges(
                  entry.badge.descriptionKey,
                  entry.badge.descriptionValues,
                )}
              </p>
            </div>
            {pinControl(entry.badge.slug, name, earned)}
          </div>
          <Facts
            items={[
              earnedOn(entry.earnedAt),
              earned ? rarityOf(entry.badge.slug) : null,
            ]}
          />
        </div>
      </li>
    );
  };

  const earnedMilestones = groups.milestones.filter((m) => m.earnedAt !== null);

  return (
    <div className="space-y-10">
      {pins && (
        <p
          id={SHOWCASE_HINT_ID}
          className="text-muted-foreground max-w-prose text-sm"
        >
          {pins.full
            ? t("showcaseFull", { limit: SHOWCASE_LIMIT })
            : pinnedCount > 0
              ? t("showcaseSome", { count: pinnedCount, limit: SHOWCASE_LIMIT })
              : t("showcaseNone", { limit: SHOWCASE_LIMIT })}
        </p>
      )}

      {groups.tracks.length > 0 && (
        <section className="space-y-3">
          <GroupHeading
            count={groups.tracks.filter((g) => g.earned > 0).length}
          >
            {t("groups.tracks")}
          </GroupHeading>
          <ul className="grid gap-x-8 xl:grid-cols-2">
            {groups.tracks.map(trackRow)}
          </ul>
        </section>
      )}

      {groups.milestones.length > 0 && (
        <section className="space-y-3">
          <GroupHeading count={earnedMilestones.length}>
            {t("groups.milestones")}
          </GroupHeading>
          <ul className="grid gap-x-8 xl:grid-cols-2">
            {groups.milestones.map(singleRow)}
          </ul>
        </section>
      )}

      {groups.limitedEditions.length > 0 && (
        <section className="space-y-3">
          <GroupHeading count={groups.limitedEditions.length}>
            {t("groups.limitedEditions")}
          </GroupHeading>
          <ul className="grid gap-x-8 xl:grid-cols-2">
            {groups.limitedEditions.map(singleRow)}
          </ul>
        </section>
      )}

      {awards.length > 0 && (
        <section className="space-y-3">
          <GroupHeading count={awards.length}>
            {t("groups.awards")}
          </GroupHeading>
          <ul className="grid gap-x-8 xl:grid-cols-2">
            {awards.map((award) => (
              <li
                key={award.id}
                data-award={award.id}
                className="border-border flex gap-4 border-t py-4"
              >
                <BadgeEmblem
                  subject={{ kind: "award", label: award.label }}
                  state={{ earned: true, earnedAt: award.earnedAt }}
                  size="md"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium break-words">{award.label}</p>
                  {award.challenge && (
                    <p className="text-muted-foreground text-sm">
                      {t.rich("awardFrom", {
                        challenge: award.challenge.title,
                        link: (chunks) => (
                          <Link
                            href={`/challenges/${award.challenge!.slug}`}
                            className="text-foreground hover:decoration-foreground decoration-muted-foreground/50 underline underline-offset-4"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </p>
                  )}
                  <Facts items={[earnedOn(award.earnedAt)]} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
