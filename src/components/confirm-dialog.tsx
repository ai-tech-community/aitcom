"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  PortalContainerProvider,
  usePortalContainerResolver,
} from "@/components/ui/portal-container";
import { usePathnameRef } from "@/hooks/use-pathname-ref";

type ConfirmOptions = {
  /** Headline. Defaults to a generic "Are you sure?". */
  title?: React.ReactNode;
  /** The specific question / consequence. */
  description?: React.ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: React.ReactNode;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: React.ReactNode;
  /** Style the confirm button as destructive (for deletes/removals). */
  destructive?: boolean;
};

type ConfirmContext = {
  /**
   * Promise-based replacement for native `window.confirm`. Opens a styled,
   * accessible AlertDialog and resolves `true` if the user confirms, `false`
   * if they cancel / dismiss. Await it from any event handler.
   */
  confirm: (options?: ConfirmOptions) => Promise<boolean>;
};

type ConfirmRequest = ConfirmOptions & {
  /**
   * Where the dialog mounts: the floating layer of the part of the page that
   * asked (a community look), so the dialog matches it. Undefined: `body`.
   */
  container?: HTMLElement;
};

const Ctx = createContext<{
  confirm: (request?: ConfirmRequest) => Promise<boolean>;
} | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmRequest>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const pathname = usePathname();
  const pathnameRef = usePathnameRef();
  // The page the pending question was asked on; null when none is pending.
  const askedOnRef = useRef<string | null>(null);

  // Resolve the pending promise exactly once. A confirm/cancel click settles
  // before Radix's own close fires onOpenChange, so the later call no-ops.
  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    askedOnRef.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmRequest = {}) => {
      // A new question answers a pending one "no", so no promise is left
      // waiting forever.
      resolverRef.current?.(false);
      askedOnRef.current = pathnameRef.current;
      setOptions(opts);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [pathnameRef],
  );

  // A question belongs to the page it was asked on: leaving that page
  // answers it "no", so the dialog never outlives the floating layer it
  // opened in (a community look's layer goes away with the community). This
  // runs as a layout effect, before the new page's passive effects, so it
  // closes only the old page's question, never one the new page asks as it
  // mounts (which carries the new page).
  useLayoutEffect(() => {
    if (askedOnRef.current !== null && askedOnRef.current !== pathname) {
      settle(false);
    }
  }, [pathname, settle]);

  // A layer detached since the question was asked (its community went away)
  // is never rendered into; `body` keeps the dialog visible.
  const container = options.container?.isConnected ? options.container : null;

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      <PortalContainerProvider container={container}>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (!next) settle(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {options.title ?? t("confirmTitle")}
              </AlertDialogTitle>
              {options.description && (
                <AlertDialogDescription>
                  {options.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? t("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className={
                  options.destructive
                    ? buttonVariants({ variant: "destructive" })
                    : undefined
                }
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? t("confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PortalContainerProvider>
    </Ctx.Provider>
  );
}

/**
 * Returns a promise-based `confirm(options?)` that opens the global styled
 * AlertDialog instead of the native, unstyled `window.confirm`.
 *
 * Example:
 *   const confirm = useConfirm();
 *   if (await confirm({ description: t("deletePostConfirm"), destructive: true })) {
 *     deletePost.mutate(...);
 *   }
 */
export function useConfirm(): ConfirmContext["confirm"] {
  const ctx = useContext(Ctx);
  // The caller's floating layer: a confirm asked from inside a community
  // look opens in that look, though the provider sits at the site root.
  const resolveContainer = usePortalContainerResolver();
  const confirm = ctx?.confirm;
  const confirmHere = useCallback(
    (options?: ConfirmOptions) =>
      confirm
        ? confirm({ ...options, container: resolveContainer() })
        : Promise.resolve(false),
    [confirm, resolveContainer],
  );
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return confirmHere;
}
