"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";

type AuthRequiredContext = {
  /**
   * Wrap an action that requires authentication. If the user is
   * authenticated the action runs immediately. Otherwise the
   * sign-in / sign-up dialog opens, branded with `intent` copy
   * (e.g. "Sign in to submit a benchmark run").
   */
  requireAuth: (action: () => void, intent?: string) => void;
  /** Imperatively open the dialog (e.g. from a button's onClick). */
  promptAuth: (intent?: string) => void;
};

const Ctx = createContext<AuthRequiredContext | null>(null);

export function AuthRequiredProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<string | undefined>();

  const requireAuth = useCallback(
    (action: () => void, intentText?: string) => {
      if (isAuthenticated) {
        action();
        return;
      }
      setIntent(intentText);
      setOpen(true);
    },
    [isAuthenticated],
  );

  const promptAuth = useCallback((intentText?: string) => {
    setIntent(intentText);
    setOpen(true);
  }, []);

  const redirect = encodeURIComponent(pathname || "/");

  return (
    <Ctx.Provider value={{ requireAuth, promptAuth }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{intent ?? "Sign in to continue"}</DialogTitle>
            <DialogDescription>
              You need an AIT account to do this. Sign in or create a free
              account — it takes about a minute.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href={`/auth/signin?redirect=${redirect}`}>
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/auth/signup?redirect=${redirect}`}>
                <UserPlus className="h-4 w-4" /> Create account
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

/**
 * Returns a `requireAuth(action, intent?)` wrapper plus a
 * `promptAuth(intent?)` opener. If the user is signed in,
 * `requireAuth` runs the action immediately; otherwise it opens the
 * global sign-in / sign-up dialog. Use anywhere a user click needs an
 * authenticated session.
 *
 * Example:
 *   const { requireAuth } = useRequireAuth();
 *   <Button onClick={() => requireAuth(() => submit.mutate(...), "Sign in to submit a run")}>…</Button>
 */
export function useRequireAuth(): AuthRequiredContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useRequireAuth must be used inside <AuthRequiredProvider>",
    );
  }
  return ctx;
}
