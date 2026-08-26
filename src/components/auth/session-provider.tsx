"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { HubAuthUser } from "@/server/better-auth/hub-session";

const InitialUserContext = createContext<HubAuthUser | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: HubAuthUser | null;
  children: ReactNode;
}) {
  return (
    <InitialUserContext.Provider value={initialUser}>
      {children}
    </InitialUserContext.Provider>
  );
}

export function useInitialAuthUser() {
  return useContext(InitialUserContext);
}
