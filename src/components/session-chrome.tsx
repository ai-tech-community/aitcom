"use client";

import dynamic from "next/dynamic";
import { useInitialAuthUser } from "@/components/auth/session-provider";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  type HubAuthUser,
} from "@/server/better-auth/hub-session";

const InboxRoot = dynamic(() =>
  import("@/components/inbox/inbox-root").then((m) => m.InboxRoot),
);

const SpaceWindowRoot = dynamic(() =>
  import("@/components/communities/explore/space-window-root").then(
    (m) => m.SpaceWindowRoot,
  ),
);

/**
 * Signed-in overlay chrome (floating inbox, space windows). Guest homepage
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
  const user = documentAuthUser(initialUser, publishedUser, session?.user);
  if (!user) return null;

  return (
    <>
      <InboxRoot />
      <SpaceWindowRoot />
    </>
  );
}
