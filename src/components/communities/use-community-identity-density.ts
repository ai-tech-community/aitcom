"use client";

import { useState } from "react";

import {
  resolveCommunityIdentityDensity,
  type CommunityIdentityDensity,
} from "@/lib/communities/layout-variant";

/**
 * The rail identity's density for the page on screen. Membership counts as
 * it was when the viewer arrived on this page: someone who joins, or accepts
 * an invitation, on a tab page keeps the full identity, so the control they
 * just used and the heading that takes focus after it stay in place. The
 * rail turns compact on their next page. A member who stops being one gets
 * the full identity at once — growing removes nothing they could be on.
 */
export function useCommunityIdentityDensity(
  segments: string[],
  isMember: boolean,
): CommunityIdentityDensity {
  const page = segments.join("/");
  const [entry, setEntry] = useState({ page, isMember });
  // A new page: remember membership as it is now (state adjusted during
  // render, React's pattern for resetting state when an input changes).
  if (entry.page !== page) setEntry({ page, isMember });
  const memberOnEntry = entry.page === page ? entry.isMember : isMember;
  return resolveCommunityIdentityDensity(segments, isMember && memberOnEntry);
}
