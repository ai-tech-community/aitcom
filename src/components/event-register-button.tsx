"use client";

import { ArrowUpRight, Check, ChevronDown, Clock3 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDayRange } from "@/lib/event-time";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";
import { useState, useSyncExternalStore } from "react";
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
  cancelled?: boolean;
  ended?: boolean;
  price?: number | null;
  isExternal?: boolean;
  sourceUrl?: string | null;
  /** The organizer's registration questions (#369). */
  questions?: RegistrationQuestion[];
  /** When the event starts, for "Edit my answers" (until the start). */
  timing?: {
    date: string;
    endDate?: string | null;
    startTime?: string | null;
    timezone?: string | null;
  };
}

const subscribeToNothing = () => () => undefined;

export function EventRegisterButton({
  eventId,
  cancelled = false,
  ended = false,
  price,
  isExternal = false,
  sourceUrl = null,
  questions = [],
  timing,
}: EventRegisterButtonProps) {
  const t = useTranslations("events");
  const format = useFormatter();
  const locale = useLocale();
  const tr = useTranslations("redesign.events");
  const redesign = isOpenCommunitiesEnabled();
  const actionClass = redesign
    ? "min-h-11 w-full whitespace-normal"
    : "w-full font-mono text-xs tracking-wider";
  const tc = useTranslations("common");
  const { promptAuth } = useRequireAuth();
  const session = authClient.useSession();
  // A streamed RSVP can hydrate after the shared session store resolves.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const isLoggedIn = !!session.data?.user;
  // First/last name are asked once, before the first registration that
  // shares them with an organizer (ADR-0038).
  const needsNames = !hasAccountNames(session.data?.user ?? {});
  // One dialog: names when the account has none, plus the organizer's
  // questions; or, once registered, just the answers.
  const [dialog, setDialog] = useState<"register" | "answers" | null>(null);
  const [cancelledEventId, setCancelledEventId] = useState<number | null>(null);
  const router = useRouter();
  const isPaid = (price ?? 0) > 0;

  const registrationStatus = api.events.registrationStatus.useQuery(
    { eventId },
    { enabled: isLoggedIn && !(redesign && ended) },
  );

  const utils = api.useUtils();

  function refreshRegistration() {
    void utils.events.registrationStatus.invalidate({ eventId });
    void utils.events.myRegistrations.invalidate();
    if (redesign) {
      void utils.events.registrationCount.invalidate({
        eventId,
        includeIntent: isExternal,
      });
      void utils.events.getAttendees.invalidate({
        eventId,
        includeIntent: isExternal,
      });
    }
  }

  const registerMutation = api.events.register.useMutation({
    onSuccess: (data) => {
      setDialog(null);
      setCancelledEventId(null);
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
      refreshRegistration();
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
      toast.error(
        error.message ||
          (redesign
            ? tr("rsvpError")
            : "Registration failed. Please try again."),
      );
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
      if (redesign) setCancelledEventId(eventId);
      else toast.success(t("registration.toastCancelled"));
      refreshRegistration();
    },
    onError: (error) => {
      toast.error(
        error.message ||
          (redesign
            ? tr("cancelError")
            : "Cancellation failed. Please try again."),
      );
    },
  });

  const markIntentMutation = api.events.markIntent.useMutation({
    onSuccess: (data) => {
      if (data.alreadyMarked) {
        toast.info(t("registration.toastAlreadyGoing"));
      } else {
        toast.success(
          redesign
            ? tr("externalIntentSaved")
            : "Marked as going. Don't forget to register on the event site.",
        );
      }
      refreshRegistration();
    },
    onError: (error) => {
      toast.error(
        error.message ||
          (redesign ? tr("saveError") : "Could not save. Please try again."),
      );
    },
  });

  const removeIntentMutation = api.events.removeIntent.useMutation({
    onSuccess: () => {
      toast.success(tc("removed"));
      refreshRegistration();
    },
    onError: (error) => {
      toast.error(
        error.message ||
          (redesign
            ? tr("removeError")
            : "Could not remove. Please try again."),
      );
    },
  });

  const cancelledNotice = (
    <p className="text-muted-foreground text-sm">
      {tr("cancelledRegistration")}
    </p>
  );

  if (redesign && ended) {
    return cancelled ? (
      cancelledNotice
    ) : (
      <p className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm font-medium">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
        {tr("eventEnded")}
      </p>
    );
  }

  if (
    redesign &&
    (!hydrated ||
      session.isPending ||
      (isLoggedIn && registrationStatus.isLoading))
  ) {
    return (
      <div aria-busy="true" aria-label={tr("loadingRegistration")}>
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (redesign && isLoggedIn && registrationStatus.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-muted-foreground text-sm">
          {tr("loadRegistrationError")}
        </p>
        <Button
          variant="outline"
          className={actionClass}
          onClick={() => void registrationStatus.refetch()}
        >
          {tr("retry")}
        </Button>
        {isExternal && sourceUrl ? (
          <ExternalSiteLink url={sourceUrl} primary />
        ) : null}
      </div>
    );
  }

  if (!isLoggedIn) {
    if (redesign && cancelled) return cancelledNotice;
    const signInLabel = redesign
      ? tr(isExternal ? "signInIntent" : "signInRsvp")
      : isExternal
        ? "Sign in to mark as going"
        : "Sign in to register";
    return (
      <div className="space-y-3">
        <Button
          variant={redesign && !isExternal ? "default" : "outline"}
          className={actionClass}
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
      <Button variant="outline" disabled className={actionClass}>
        Loading...
      </Button>
    );
  }

  if (registrationStatus.data) {
    const status = registrationStatus.data.status;

    if (isExternal && status === "intent") {
      return (
        <div className="space-y-3">
          {redesign ? (
            <RegistrationStatus confirmed>
              {tr("status.intent")}
            </RegistrationStatus>
          ) : (
            <div className="border-border flex items-center gap-2 rounded border px-4 py-2.5">
              <div className="bg-primary h-2 w-2 rounded-full" />
              <span className="text-muted-foreground font-mono text-xs tracking-wider">
                STATUS: GOING
              </span>
            </div>
          )}
          {redesign && cancelled
            ? cancelledNotice
            : sourceUrl && <ExternalSiteLink url={sourceUrl} primary />}
          <Button
            variant="outline"
            className={actionClass}
            onClick={() => removeIntentMutation.mutate({ eventId })}
            disabled={removeIntentMutation.isPending}
          >
            {redesign
              ? tr(removeIntentMutation.isPending ? "removing" : "notGoing")
              : removeIntentMutation.isPending
                ? "Removing..."
                : "Not going"}
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

    const canEditAnswers =
      questions.length > 0 &&
      timing &&
      canChangeAnswers(timing) &&
      status !== "attended";
    const canCancel = status !== "pending_payment";
    const controls = (
      <>
        {canEditAnswers ? (
          <Button
            variant="outline"
            className={cn("w-full", redesign && "min-h-11")}
            onClick={() => setDialog("answers")}
          >
            {t("registration.editAnswers")}
          </Button>
        ) : null}
        {canCancel && (
          <Button
            variant="outline"
            className={actionClass}
            onClick={() => cancelMutation.mutate({ eventId })}
            disabled={cancelMutation.isPending}
          >
            {redesign
              ? tr(
                  cancelMutation.isPending
                    ? "cancelling"
                    : "cancelRegistration",
                )
              : cancelMutation.isPending
                ? "Cancelling..."
                : "Cancel registration"}
          </Button>
        )}
      </>
    );

    return (
      <div className="space-y-3">
        {redesign ? (
          <RegistrationStatus
            confirmed={status === "registered" || status === "attended"}
            date={
              status === "registered" && timing
                ? formatEventDayRange(timing.date, timing.endDate, locale)
                : undefined
            }
          >
            {tr(`status.${status}`)}
          </RegistrationStatus>
        ) : (
          <div className="border-border flex items-center gap-2 rounded border px-4 py-2.5">
            <div className="bg-primary h-2 w-2 rounded-full" />
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              STATUS: {statusLabel}
            </span>
          </div>
        )}
        {redesign ? (
          canEditAnswers || canCancel ? (
            <details className="group rounded-md border">
              <summary className="focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                {tr("manageRsvp")}
                <ChevronDown
                  aria-hidden="true"
                  className="text-muted-foreground size-4 group-open:rotate-180"
                />
              </summary>
              <div className="space-y-2 border-t p-2">{controls}</div>
            </details>
          ) : null
        ) : (
          controls
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

  if (redesign && cancelled) return cancelledNotice;

  if (isExternal) {
    return (
      <div className="space-y-3">
        {sourceUrl && <ExternalSiteLink url={sourceUrl} primary />}
        <Button
          variant="outline"
          className={actionClass}
          onClick={() => markIntentMutation.mutate({ eventId })}
          disabled={markIntentMutation.isPending}
        >
          {redesign
            ? tr(markIntentMutation.isPending ? "saving" : "markGoing")
            : markIntentMutation.isPending
              ? "Saving..."
              : "I'm going"}
        </Button>
        <p
          className={cn(
            "text-muted-foreground text-center text-xs",
            !redesign && "font-mono tracking-wider",
          )}
        >
          {redesign
            ? tr("externalNotice")
            : "Registration handled on external site"}
        </p>
      </div>
    );
  }

  const priceLabel = isPaid ? ` - €${((price ?? 0) / 100).toFixed(2)}` : "";

  return (
    <div className="space-y-2">
      <Button
        className={actionClass}
        onClick={() => register()}
        disabled={registerMutation.isPending}
      >
        {redesign
          ? registerMutation.isPending
            ? tr("registering")
            : isPaid
              ? tr("paidRegistration", {
                  price: format.number((price ?? 0) / 100, {
                    style: "currency",
                    currency: "EUR",
                  }),
                })
              : tr("rsvp")
          : registerMutation.isPending
            ? "Registering..."
            : `Register${priceLabel}`}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t("registration.organizerNotice")}
      </p>
      {redesign ? (
        <p role="status" className="text-muted-foreground text-sm empty:hidden">
          {cancelledEventId === eventId ? tr("status.cancelled") : null}
        </p>
      ) : null}
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

function RegistrationStatus({
  confirmed,
  date,
  children,
}: {
  confirmed: boolean;
  date?: string;
  children: React.ReactNode;
}) {
  const Icon = confirmed ? Check : Clock3;
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
        confirmed
          ? "border-success/35 bg-success/10 text-success"
          : "border-border bg-secondary/60",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
        <span>{children}</span>
        {date ? (
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            {date}
          </span>
        ) : null}
      </div>
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
  const tr = useTranslations("redesign.events");
  if (isOpenCommunitiesEnabled()) {
    return (
      <Button
        asChild
        variant={primary ? "default" : "outline"}
        className="min-h-11 w-full whitespace-normal"
      >
        <a href={url} target="_blank" rel="noreferrer">
          {tr("externalRegister")}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
    );
  }

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
