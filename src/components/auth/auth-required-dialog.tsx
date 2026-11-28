"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  PortalContainerProvider,
  usePortalContainerResolver,
} from "@/components/ui/portal-container";
import { usePathnameRef } from "@/hooks/use-pathname-ref";
import { authClient } from "@/server/better-auth/client";

/**
 * `unknown` means the session fetch failed: we cannot tell a guest from a
 * member, so code acting without a click must not guess.
 */
export type AuthStatus = "pending" | "authenticated" | "guest" | "unknown";

export type AuthPromptOptions = {
  /**
   * Locale-prefixed path to return to after sign-in / sign-up. Defaults to
   * the current pathname; pass it when the return trip must carry state the
   * pathname alone loses (e.g. `/en/communities?create=1`).
   */
  returnTo?: string;
  /**
   * The dialog's explanation, when the action has a better one than the
   * generic line (e.g. "we'll bring you back and finish joining").
   */
  description?: string;
};

type AuthRequiredContext = {
  /**
   * Wrap an action that requires authentication. If the user is
   * authenticated the action runs immediately. Otherwise the
   * sign-in / sign-up dialog opens, branded with `intent` copy
   * (e.g. "Sign in to submit a benchmark run").
   */
  requireAuth: (
    action: () => void,
    intent?: string,
    options?: AuthPromptOptions,
  ) => void;
  /** Imperatively open the dialog (e.g. from a button's onClick). */
  promptAuth: (intent?: string, options?: AuthPromptOptions) => void;
  /**
   * Whether the client session is known. Code that acts without a click
   * (e.g. a deep link that opens a dialog on load) must act only on
   * `"authenticated"` or `"guest"`; `"pending"` and `"unknown"` (fetch
   * failed) would show a signed-in member the guest prompt.
   */
  authStatus: AuthStatus;
};

/**
 * What the provider takes from a caller: the public options, plus where the
 * dialog mounts — the caller's floating layer (a community look), so the
 * dialog matches it. `useRequireAuth` adds it; callers never pass it.
 */
type AuthPromptRequest = AuthPromptOptions & { container?: HTMLElement };

type ProviderContext = {
  prompt: (intent?: string, request?: AuthPromptRequest) => void;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
};

const Ctx = createContext<ProviderContext | null>(null);

export function AuthRequiredProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;
  const authStatus: AuthStatus = isAuthenticated
    ? "authenticated"
    : session.isPending
      ? "pending"
      : session.error
        ? "unknown"
        : "guest";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<string | undefined>();
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [description, setDescription] = useState<string | undefined>();
  const [container, setContainer] = useState<HTMLElement | undefined>();
  const t = useTranslations("auth");

  const pathnameRef = usePathnameRef();
  // The page the open prompt was asked on; null while closed.
  const askedOnRef = useRef<string | null>(null);

  const close = useCallback(() => {
    askedOnRef.current = null;
    setOpen(false);
  }, []);

  const prompt = useCallback(
    (intentText?: string, request?: AuthPromptRequest) => {
      askedOnRef.current = pathnameRef.current;
      setIntent(intentText);
      setReturnTo(request?.returnTo);
      setDescription(request?.description);
      setContainer(request?.container);
      setOpen(true);
    },
    [pathnameRef],
  );

  // A prompt belongs to the page it was asked on: leaving that page closes
  // it, so it never outlives the floating layer it opened in (a community
  // look's layer goes away with the community). This runs as a layout
  // effect, before the new page's passive effects, so it closes only the
  // old page's prompt, never one the new page asks for as it mounts (which
  // carries the new page).
  useLayoutEffect(() => {
    if (askedOnRef.current !== null && askedOnRef.current !== pathname) {
      close();
    }
  }, [pathname, close]);

  // A layer detached since the prompt was asked (its community went away)
  // is never rendered into; `body` keeps the dialog visible.
  const shownIn = container?.isConnected ? container : null;

  const redirect = encodeURIComponent(returnTo ?? (pathname || "/"));

  return (
    <Ctx.Provider value={{ prompt, isAuthenticated, authStatus }}>
      {children}
      <PortalContainerProvider container={shownIn}>
        <Dialog
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : close())}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{intent ?? t("promptTitle")}</DialogTitle>
              <DialogDescription>
                {description ?? t("promptBody")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href={`/auth/signin?redirect=${redirect}`}>
                  <LogIn className="h-4 w-4" /> {t("promptSignIn")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/auth/signup?redirect=${redirect}`}>
                  <UserPlus className="h-4 w-4" /> {t("promptCreateAccount")}
                </Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PortalContainerProvider>
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
  // The caller's floating layer: a prompt asked from inside a community
  // look opens in that look, though the provider sits at the site root.
  const resolveContainer = usePortalContainerResolver();
  const prompt = ctx?.prompt;
  const isAuthenticated = ctx?.isAuthenticated ?? false;

  const promptAuth = useCallback(
    (intentText?: string, options?: AuthPromptOptions) =>
      prompt?.(intentText, { ...options, container: resolveContainer() }),
    [prompt, resolveContainer],
  );
  const requireAuth = useCallback(
    (action: () => void, intentText?: string, options?: AuthPromptOptions) => {
      if (isAuthenticated) {
        action();
        return;
      }
      promptAuth(intentText, options);
    },
    [isAuthenticated, promptAuth],
  );
  const value = useMemo(
    () => ({
      requireAuth,
      promptAuth,
      authStatus: ctx?.authStatus ?? ("unknown" as AuthStatus),
    }),
    [requireAuth, promptAuth, ctx?.authStatus],
  );

  if (!ctx) {
    throw new Error(
      "useRequireAuth must be used inside <AuthRequiredProvider>",
    );
  }
  return value;
}
