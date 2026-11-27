import type { ComponentType } from "react";

import type { CommunityThemeId } from "@/lib/communities/themes";

import { CanalCover } from "./covers/canal-cover";
import { MeadowCover } from "./covers/meadow-cover";
import { NightCover } from "./covers/night-cover";
import { SunsetCover } from "./covers/sunset-cover";

/**
 * The cover art of each look, drawn where a community has no banner picture.
 * Each drawing fills its positioned box and takes every color from
 * `var(--community-cover-<role>)`, which `CommunityThemeScope` sets from the
 * look's cover palette; the catalog test measures those colors. null: the
 * look has no art (Plain).
 */
export const COMMUNITY_COVER_ART: Record<
  CommunityThemeId,
  ComponentType | null
> = {
  plain: null,
  canal: CanalCover,
  meadow: MeadowCover,
  sunset: SunsetCover,
  night: NightCover,
};
