import type { ComponentType } from "react";

import type { IssueLayout } from "@/lib/magazines/values";

import { LongReadLayout } from "./long-read";
import { DigestLayout } from "./digest";
import { CoverStoryLayout } from "./cover-story";
import type { LayoutProps } from "./types";

export type { LayoutProps } from "./types";

/**
 * One component per issue layout (`ISSUE_LAYOUTS`). A layout without a
 * component is a type error.
 */
export const LAYOUTS: Record<IssueLayout, ComponentType<LayoutProps>> = {
  "cover-story": CoverStoryLayout,
  "long-read": LongReadLayout,
  digest: DigestLayout,
};
