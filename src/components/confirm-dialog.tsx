"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
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

const Ctx = createContext<ConfirmContext | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions = {}) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Resolve the pending promise exactly once. A confirm/cancel click settles
  // before Radix's own close fires onOpenChange, so the later call no-ops.
  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
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
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx.confirm;
}
