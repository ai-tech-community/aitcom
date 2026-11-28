import { useMutation } from "@tanstack/react-query";
import type { RouterOutputs } from "@/trpc/react";

type Webhook = NonNullable<RouterOutputs["agentManagement"]["getWebhook"]>;
const supportedCategories = new Set([
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
]);

export function canRotateWebhookSecret(
  webhook: Webhook,
  agentId: string | undefined,
) {
  // The bearer endpoint operates on the agent's row, enables delivery, and
  // only accepts this subset. Keep the saved configuration intact.
  return (
    webhook.agentId === agentId &&
    webhook.status === "active" &&
    webhook.isEnabled &&
    webhook.categories.length > 0 &&
    webhook.categories.every((category) => supportedCategories.has(category))
  );
}

export function useWebhookSecretRotation(onSuccess: (secret: string) => void) {
  return useMutation<
    string,
    Error & { status?: number },
    { webhook: Webhook; key: string }
  >({
    async mutationFn({ webhook, key }) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const secret = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const response = await fetch("/api/agent/webhook", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        redirect: "error",
        body: JSON.stringify({
          url: webhook.url,
          categories: webhook.categories,
          secret,
        }),
      });
      if (!response.ok)
        throw Object.assign(new Error("Webhook secret update failed"), {
          status: response.status,
        });
      return secret;
    },
    onSuccess,
  });
}
