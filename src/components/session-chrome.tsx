"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSiteShell } from "@/components/site-chrome-gate";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  type HubAuthUser,
} from "@/server/better-auth/hub-session";

const InboxRoot = dynamic(() =>
  import("@/components/inbox/inbox-root").then((m) => m.InboxRoot),
);

const OnboardingReminder = dynamic(() =>
  import("@/components/onboarding/onboarding-reminder").then(
    (m) => m.OnboardingReminder,
  ),
);

// A small probe: the celebration dialog itself loads only when there is
// something to celebrate.
const BadgeCelebrationProbe = dynamic(() =>
  import("@/components/badges/badge-celebration-probe").then(
    (m) => m.BadgeCelebrationProbe,
  ),
);

const SpaceWindowRoot = dynamic(() =>
  import("@/components/communities/explore/space-window-root").then(
    (m) => m.SpaceWindowRoot,
  ),
);

/**
 * Signed-in overlay chrome (floating inbox + getting-started reminder in one
 * bottom-right dock, space windows, the badge earning moment). Guest homepage
 * visitors never download streamdown / mermaid / RoomView / framer-motion
 * from this path — next/dynamic only fetches after a user exists.
 */
export function SessionChrome({
  initialUser = null,
}: {
  initialUser?: HubAuthUser | null;
}) {
  const { data: session } = authClient.useSession();
  const publishedUser = useInitialAuthUser();
  const shell = useSiteShell();
  const aboveMobileNav = shell === "community" || shell === "hub";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const user = documentAuthUser(initialUser, publishedUser, session?.user);
  // The overlays read the client session, which can already be cached when
  // React hydrates a document whose overlay tree was empty on the server.
  if (!user || (shell && !hydrated)) return null;

  return (
    <>
      <InboxRoot
        dockLeading={shell ? undefined : <OnboardingReminder />}
        showLauncher={!shell}
        aboveMobileNav={aboveMobileNav}
      />
      <SpaceWindowRoot aboveMobileNav={aboveMobileNav} />
      <BadgeCelebrationProbe userId={user.id} />
    </>
  );
}
