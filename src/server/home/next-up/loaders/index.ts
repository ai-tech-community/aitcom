import type { NextUpLoader } from "../types";

import { loadChallengeItems } from "./challenges";
import { loadEventItems } from "./events";
import { loadInviteItems } from "./invites";
import { loadJoinRequestItems } from "./join-requests";
import { loadUnreadItems } from "./unread";

/**
 * Every source of Next up. A new kind of next action is one more line here
 * (plus its loader file, its union member and its row renderer).
 */
export const NEXT_UP_LOADERS: readonly NextUpLoader[] = [
  { name: "events", load: loadEventItems },
  { name: "challenges", load: loadChallengeItems },
  { name: "invites", load: loadInviteItems },
  { name: "joinRequests", load: loadJoinRequestItems },
  { name: "unread", load: loadUnreadItems },
];
