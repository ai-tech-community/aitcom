"use client";

import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { toast } from "sonner";

interface EventRegisterButtonProps {
  eventId: number;
  price?: number | null;
  isExternal?: boolean;
  sourceUrl?: string | null;
}

export function EventRegisterButton({
  eventId,
  price,
  isExternal = false,
  sourceUrl = null,
}: EventRegisterButtonProps) {
  const router = useRouter();
  const { promptAuth } = useRequireAuth();
  const session = authClient.useSession();

  const isLoggedIn = !!session.data?.user;
  const isPaid = (price ?? 0) > 0;

  const registrationStatus = api.events.registrationStatus.useQuery(
    { eventId },
    { enabled: isLoggedIn },
  );

  const utils = api.useUtils();

  const registerMutation = api.events.register.useMutation({
    onSuccess: (data) => {
      if (data.alreadyRegistered) {
        toast.info("You are already registered for this event.");
      } else if (data.checkoutUrl) {
        toast.info("Redirecting to payment...");
        window.location.href = data.checkoutUrl;
        return;
      } else if (data.registration?.status === "waitlisted") {
        toast.success("You have been added to the waitlist.");
      } else {
        toast.success("Successfully registered!");
      }
      void utils.events.registrationStatus.invalidate({ eventId });
      void utils.events.myRegistrations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Registration failed. Please try again.");
    },
  });

  const cancelMutation = api.events.cancelRegistration.useMutation({
    onSuccess: () => {
      toast.success("Registration cancelled.");
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
        toast.info("Already marked as going.");
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
      toast.success("Removed.");
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
        <p className="text-muted-foreground text-center font-mono text-[11px] tracking-wider">
          Registration handled on external site
        </p>
      </div>
    );
  }

  const priceLabel = isPaid ? ` - €${((price ?? 0) / 100).toFixed(2)}` : "";

  return (
    <Button
      className="w-full font-mono text-xs tracking-wider"
      onClick={() => registerMutation.mutate({ eventId })}
      disabled={registerMutation.isPending}
    >
      {registerMutation.isPending ? "Registering..." : `Register${priceLabel}`}
    </Button>
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
