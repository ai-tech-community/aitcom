"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CodeXmlIcon, KeyRoundIcon } from "lucide-react";
import { EVENT_DELIVERY_POLICY } from "@/server/agent/event-delivery-policy";
import { BuilderCode } from "./builder-code";
import { BuilderDisclosure, webhookGuideUrl } from "./builder-ui";

const verifier = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody, signature, secret) {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from("sha256=" + digest);
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}`;

const samplePayload = JSON.stringify(
  {
    type: "message.sent",
    data: {
      actorId: "user_123",
      actorType: "member",
      actorName: "Alex",
      targetType: "conversations",
      targetId: "conversation_123",
      metadata: {},
    },
    eventId: "event_123",
    timestamp: "2026-11-28T12:00:00.000Z",
  },
  null,
  2,
);

export function BuilderWebhookReference({
  configured,
  hasIssuedSecret,
  rotationAvailability,
  rotateAction,
  rotationFailure,
}: {
  configured: boolean;
  hasIssuedSecret: boolean;
  rotationAvailability: "available" | "requiresKey" | "unsupported";
  rotateAction: ReactNode;
  rotationFailure?: ReactNode;
}) {
  const t = useTranslations("redesign.builder.webhook");

  return (
    <div className="border-border divide-border divide-y border-y">
      <BuilderDisclosure title={t("signing.title")} icon={KeyRoundIcon}>
        <p className="text-muted-foreground text-sm">
          {t("signing.help")}{" "}
          <a
            href={webhookGuideUrl}
            className="focus-visible:outline-ring rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2"
          >
            {t("guide")}
          </a>
        </p>
        {configured && (
          <>
            {!hasIssuedSecret && (
              <p className="text-muted-foreground text-sm">
                {t("signing.previouslyShown", {
                  rotation: rotationAvailability,
                })}
              </p>
            )}
            {rotateAction}
            <p className="text-muted-foreground text-sm">
              {t(
                rotationAvailability === "available"
                  ? "signing.afterRotate"
                  : "signing.replace",
              )}
            </p>
            {rotationAvailability === "requiresKey" && (
              <p className="text-muted-foreground text-sm">
                {t("signing.verifyKeyForRotation")}
              </p>
            )}
            {rotationFailure}
          </>
        )}
        <BuilderCode label={t("signing.example")} value={verifier} />
      </BuilderDisclosure>
      <BuilderDisclosure title={t("payload.title")} icon={CodeXmlIcon}>
        <p className="text-muted-foreground text-sm">{t("payload.help")}</p>
        <BuilderCode label={t("payload.example")} value={samplePayload} />
        <dl className="divide-border border-border divide-y border-y">
          {Object.entries(EVENT_DELIVERY_POLICY).map(([action, rule]) => (
            <div
              key={action}
              className="grid gap-1 py-2 sm:grid-cols-2 sm:gap-4"
            >
              <dt className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">
                {action}
              </dt>
              <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">
                {rule.fields.length ? (
                  <code className="font-mono text-xs">
                    {rule.fields.join(", ")}
                  </code>
                ) : (
                  t("payload.noMetadata")
                )}
              </dd>
            </div>
          ))}
        </dl>
      </BuilderDisclosure>
    </div>
  );
}
