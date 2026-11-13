"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { DashboardSection } from "@/components/dashboard/dashboard-section";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

/**
 * Settings control for erasing the signed-in account. The member types
 * DELETE, then the server removes sign-in and personal data and this
 * signs them out.
 */
export function DeleteAccountSettings() {
  const t = useTranslations("dashboard.deleteAccount");
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const word = ACCOUNT_DELETION_CONFIRMATION;
  const confirmed = typed === word;

  const deleteAccount = api.members.deleteAccount.useMutation({
    onSuccess: async () => {
      try {
        await authClient.signOut();
      } catch {
        // The session row is already gone. The cookie clear is best-effort.
      }
      window.location.assign("/");
    },
  });

  return (
    <DashboardSection id="delete-account" title={t("title")}>
      <p className="text-muted-foreground max-w-prose text-sm">
        {t("description")}
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped("");
            deleteAccount.reset();
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="mt-4">
            {t("action")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescription", { word })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <label htmlFor="delete-account-confirmation" className="text-sm">
              {t("confirmLabel", { word })}
            </label>
            <Input
              id="delete-account-confirmation"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          {deleteAccount.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t("error")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <button
              type="button"
              className={buttonVariants({ variant: "destructive" })}
              disabled={!confirmed || deleteAccount.isPending}
              onClick={() => {
                if (!confirmed) return;
                deleteAccount.mutate({ confirmation: word });
              }}
            >
              {t("confirm")}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardSection>
  );
}
