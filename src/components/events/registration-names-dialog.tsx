"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { personNameSchema, suggestNameParts } from "@/lib/person-name";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface RegistrationNames {
  firstName: string;
  lastName: string;
}

/**
 * Asks for first and last name once, at the first registration that needs
 * them (ADR-0038). Starts from the member's current name split on its first
 * space; they correct it, and it is saved to their account with the
 * registration, so no later event asks again.
 */
export function RegistrationNamesDialog({
  open,
  currentName,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  currentName: string | null | undefined;
  pending: boolean;
  onConfirm: (names: RegistrationNames) => void;
  onClose: () => void;
}) {
  const t = useTranslations("events.registration");
  const suggested = suggestNameParts(currentName);
  const [firstName, setFirstName] = useState(suggested.firstName);
  const [lastName, setLastName] = useState(suggested.lastName);
  const [showErrors, setShowErrors] = useState(false);

  const first = personNameSchema.safeParse(firstName);
  const last = personNameSchema.safeParse(lastName);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!first.success || !last.success) {
      setShowErrors(true);
      return;
    }
    onConfirm({ firstName: first.data, lastName: last.data });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("namesTitle")}</DialogTitle>
            <DialogDescription>{t("namesDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="registration-first-name">{t("firstName")}</Label>
              <Input
                id="registration-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={100}
                autoComplete="given-name"
                aria-invalid={showErrors && !first.success}
                aria-describedby={
                  showErrors && !first.success
                    ? "registration-first-name-error"
                    : undefined
                }
              />
              {showErrors && !first.success ? (
                <p
                  id="registration-first-name-error"
                  className="text-destructive text-xs"
                >
                  {t("nameRequired")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="registration-last-name">{t("lastName")}</Label>
              <Input
                id="registration-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={100}
                autoComplete="family-name"
                aria-invalid={showErrors && !last.success}
                aria-describedby={
                  showErrors && !last.success
                    ? "registration-last-name-error"
                    : undefined
                }
              />
              {showErrors && !last.success ? (
                <p
                  id="registration-last-name-error"
                  className="text-destructive text-xs"
                >
                  {t("nameRequired")}
                </p>
              ) : null}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            {t("organizerNotice")}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("namesCancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("namesConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
