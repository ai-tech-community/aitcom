"use client";

import { useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { hasAccountNames } from "@/lib/person-name";
import {
  ANSWERS_INVALID,
  canChangeAnswers,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/events/registration-questions";
import {
  RegistrationDialog,
  type RegistrationSubmission,
} from "@/components/events/registration-dialog";

interface EventRegisterButtonProps {
  eventId: number;
  price?: number | null;
  isExternal?: boolean;
  sourceUrl?: string | null;
  /** The organizer's registration questions (#369). */
  questions?: RegistrationQuestion[];
  /** When the event starts, for "Edit my answers" (until the start). */
  timing?: {
    date: string;
    startTime?: string | null;
    timezone?: string | null;
  };
}

export function EventRegisterButton({
  eventId,
  price,
  isExternal = false,
  sourceUrl = null,
  questions = [],
  timing,
}: EventRegisterButtonProps) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const { promptAuth } = useRequireAuth();
  const session = authClient.useSession();

  const isLoggedIn = !!session.data?.user;
  // First/last name are asked once, before the first registration that
  // shares them with an organizer (ADR-0038).
  const needsNames = !hasAccountNames(session.data?.user ?? {});
  // One dialog: names when the account has none, plus the organizer's
  // questions; or, once registered, just the answers.
  const [dialog, setDialog] = useState<"register" | "answers" | null>(null);
  const router = useRouter();
  const isPaid = (price ?? 0) > 0;

  const registrationStatus = api.events.registrationStatus.useQuery(
    { eventId },
    { enabled: isLoggedIn },
  );

  const utils = api.useUtils();

  const registerMutation = api.events.register.useMutation({
    onSuccess: (data) => {
      setDialog(null);
      // Names given with this registration are now on the account.
      void session.refetch();
      if (data.alreadyRegistered) {
        toast.info(t("registration.toastAlready"));
      } else if (data.checkoutUrl) {
        toast.info(t("registration.toastRedirecting"));
        window.location.href = data.checkoutUrl;
        return;
      } else if (data.registration?.status === "waitlisted") {
        toast.success(t("registration.toastWaitlisted"));
      } else {
        toast.success(t("registration.toastRegistered"));
      }
      void utils.events.registrationStatus.invalidate({ eventId });
      void utils.events.myRegistrations.invalidate();
    },
    onError: (error) => {
      // The account has no names yet (e.g. a stale session): ask for them.
      if (error.data?.code === "PRECONDITION_FAILED") {
        setDialog("register");
        return;
      }
      // The organizer changed the questions since this page loaded: load
      // the new ones and ask again.
      if (error.message === ANSWERS_INVALID) {
        toast.info(t("registration.answersChanged"));
        router.refresh();
        setDialog("register");
        return;
      }
      toast.error(error.message || "Registration failed. Please try again.");
    },
  });

  function register(submission?: RegistrationSubmission) {
    if (!submission && (needsNames || questions.length > 0)) {
      setDialog("register");
      return;
    }
    registerMutation.mutate({
      eventId,
      ...submission?.names,
      answers: submission?.answers,
    });
  }

  const answersMutation = api.events.updateMyAnswers.useMutation({
    onSuccess: () => {
      setDialog(null);
      toast.success(t("registration.answersSaved"));
      void utils.events.registrationStatus.invalidate({ eventId });
    },
    onError: (error) => {
      if (error.message === ANSWERS_INVALID) {
        toast.info(t("registration.answersChanged"));
        router.refresh();
        return;
      }
      toast.error(t("registration.answersSaveError"));
    },
  });

  const cancelMutation = api.events.cancelRegistration.useMutation({
    onSuccess: () => {
      toast.success(t("registration.toastCancelled"));
      void utils.events.registrationStatus.invalidate({ eventId });
      void utils.events.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Cancellation failed. Please try again.");
    },
  });

  const markIntentMutation = api.events.markIntent.useMutation({
    onSuccess: (data) => {
      if (data.alreadyMarked) {
        toast.info(t("registration.toastAlreadyGoing"));
      } else {
        toast.success(
          "Marked as going. Don't forget to register on the event site.",
        );
      }
      void utils.events.registrationStatus.invalidate({ eventId });
      void utils.events.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Could not save. Please try again.");
    },
  });

  const removeIntentMutation = api.events.removeIntent.useMutation({
    onSuccess: () => {
      toast.success(tc("removed"));
      void utils.events.registrationStatus.invalidate({ eventId });
      void utils.events.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Could not remove. Please try again.");
    },
  });

  if (!isLoggedIn) {
    const signInLabel = isExternal
      ? "Sign in to mark as going"
      : "Sign in to register";
    return (
      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full font-mono text-xs tracking-wider"
          onClick={() => promptAuth(signInLabel)}
        >
          {signInLabel}
        </Button>
        {isExternal && sourceUrl && (
          <ExternalSiteLink url={sourceUrl} primary />
        )}
      </div>
    );
  }

  if (registrationStatus.isLoading) {
    return (
      <Button
        variant="outline"
        disabled
        className="w-full font-mono text-xs tracking-wider"
      >
        Loading...
      </Button>
    );
  }

  if (registrationStatus.data) {
    const status = registrationStatus.data.status;

    if (isExternal && status === "intent") {
      return (
        <div className="space-y-3">
          <div className="border-border flex items-center gap-2 rounded border px-4 py-2.5">
            <div className="bg-primary h-2 w-2 rounded-full" />
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              STATUS: GOING
            </span>
          </div>
          {sourceUrl && <ExternalSiteLink url={sourceUrl} primary />}
          <Button
            variant="outline"
            className="w-full font-mono text-xs tracking-wider"
            onClick={() => removeIntentMutation.mutate({ eventId })}
            disabled={removeIntentMutation.isPending}
          >
            {removeIntentMutation.isPending ? "Removing..." : "Not going"}
          </Button>
        </div>
      );
    }

    const statusLabel =
      status === "registered"
        ? "REGISTERED"
        : status === "waitlisted"
          ? "WAITLISTED"
          : status === "attended"
            ? "ATTENDED"
            : status === "pending_payment"
              ? "PENDING PAYMENT"
              : status.toUpperCase();

    return (
      <div className="space-y-3">
        <div className="border-border flex items-center gap-2 rounded border px-4 py-2.5">
          <div className="bg-primary h-2 w-2 rounded-full" />
          <span className="text-muted-foreground font-mono text-xs tracking-wider">
            STATUS: {statusLabel}
          </span>
        </div>
        {questions.length > 0 &&
        timing &&
        canChangeAnswers(timing) &&
        status !== "attended" ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setDialog("answers")}
          >
            {t("registration.editAnswers")}
          </Button>
        ) : null}
        {status !== "pending_payment" && (
          <Button
            variant="outline"
            className="w-full font-mono text-xs tracking-wider"
            onClick={() => cancelMutation.mutate({ eventId })}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? "Cancelling..." : "Cancel registration"}
          </Button>
        )}
        {dialog === "answers" ? (
          <RegistrationDialog
            open
            mode="answers"
            askNames={false}
            currentName={null}
            questions={questions}
            initialAnswers={
              (registrationStatus.data?.answers ?? {}) as RegistrationAnswers
            }
            pending={answersMutation.isPending}
            onConfirm={({ answers }) =>
              answersMutation.mutate({ eventId, answers })
            }
            onClose={() => setDialog(null)}
          />
        ) : null}
      </div>
    );
  }

  if (isExternal) {
    return (
      <div className="space-y-3">
        {sourceUrl && <ExternalSiteLink url={sourceUrl} primary />}
        <Button
          variant="outline"
          className="w-full font-mono text-xs tracking-wider"
          onClick={() => markIntentMutation.mutate({ eventId })}
          disabled={markIntentMutation.isPending}
        >
          {markIntentMutation.isPending ? "Saving..." : "I'm going"}
        </Button>
        <p className="text-muted-foreground text-center font-mono text-xs tracking-wider">
          Registration handled on external site
        </p>
      </div>
    );
  }

  const priceLabel = isPaid ? ` - €${((price ?? 0) / 100).toFixed(2)}` : "";

  return (
    <div className="space-y-2">
      <Button
        className="w-full font-mono text-xs tracking-wider"
        onClick={() => register()}
        disabled={registerMutation.isPending}
      >
        {registerMutation.isPending
          ? "Registering..."
          : `Register${priceLabel}`}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t("registration.organizerNotice")}
      </p>
      {dialog === "register" ? (
        <RegistrationDialog
          open
          mode="register"
          askNames={needsNames}
          currentName={session.data?.user?.name}
          questions={questions}
          pending={registerMutation.isPending}
          onConfirm={(submission) => register(submission)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function ExternalSiteLink({
  url,
  primary,
}: {
  url: string;
  primary?: boolean;
}) {
  const base =
    "w-full inline-flex items-center justify-center rounded-md px-4 py-2 font-mono text-xs tracking-wider transition-colors";
  const styles = primary
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : "border border-border hover:bg-secondary/40";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${styles}`}
    >
      Register on event site ↗
    </a>
  );
}
