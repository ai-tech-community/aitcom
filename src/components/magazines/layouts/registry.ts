import type { ComponentType } from "react";

import type { IssueLayout } from "@/lib/magazines/values";

import { CoverStoryLayout } from "./cover-story";
import type { LayoutProps } from "./types";

export type { LayoutProps } from "./types";

/**
 * One component per issue layout (`ISSUE_LAYOUTS`). A layout without a
 * component is a type error; later slices add `long-read` and `digest`.
 */
export const LAYOUTS: Record<IssueLayout, ComponentType<LayoutProps>> = {
  "cover-story": CoverStoryLayout,
};
