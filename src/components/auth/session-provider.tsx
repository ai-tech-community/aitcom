"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import type { HubAuthUser } from "@/server/better-auth/hub-session";

const InitialUserContext = createContext<HubAuthUser | null>(null);
const PublishUserContext = createContext<(user: HubAuthUser | null) => void>(
  () => {},
);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: HubAuthUser | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  useLayoutEffect(() => {
    // Stale guest locale layout must not wipe a Hub page seed (Member).
    // Sign-out reloads the document so this does not keep a stale user.
    if (initialUser?.id) setUser(initialUser);
  }, [initialUser]);

  return (
    <PublishUserContext.Provider value={setUser}>
      <InitialUserContext.Provider value={user}>
        {children}
      </InitialUserContext.Provider>
    </PublishUserContext.Provider>
  );
}

export function useInitialAuthUser() {
  return useContext(InitialUserContext);
}

/**
 * Hub page/layout seed after password sign-in. Locale layout (navbar /
 * SessionProvider) can still be the guest document; publish before paint
 * so JOIN and “Sign in to post” match Member + composer.
 */
export function usePublishDocumentAuthUser(user: HubAuthUser | null) {
  const publish = useContext(PublishUserContext);
  useLayoutEffect(() => {
    if (user?.id) publish(user);
  }, [publish, user]);
}
