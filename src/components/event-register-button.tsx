"use client";

import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

interface EventRegisterButtonProps {
  eventId: number;
  price?: number | null;
}

export function EventRegisterButton({
  eventId,
  price,
}: EventRegisterButtonProps) {
  const router = useRouter();
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

  // Not logged in
  if (!isLoggedIn) {
    return (
      <Button
        variant="outline"
        className="w-full font-mono text-xs tracking-wider"
        onClick={() => router.push("/auth/signin")}
      >
        Sign in to register
      </Button>
    );
  }

  // Loading registration status
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

  // Already registered
  if (registrationStatus.data) {
    const status = registrationStatus.data.status;
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

  // Not registered yet
  const priceLabel = isPaid
    ? ` — €${((price ?? 0) / 100).toFixed(2)}`
    : "";

  return (
    <Button
      className="w-full font-mono text-xs tracking-wider"
      onClick={() => registerMutation.mutate({ eventId })}
      disabled={registerMutation.isPending}
    >
      {registerMutation.isPending
        ? "Registering..."
        : `Register${priceLabel}`}
    </Button>
  );
}
