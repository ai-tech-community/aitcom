"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, RefreshCw, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useInboxConnectionStatus } from "./use-inbox-stream";

const RECONNECT_NOTICE_DELAY_MS = 3_000;
const BACK_ONLINE_NOTICE_MS = 2_000;

export function ConnectionStatus() {
  const t = useTranslations("redesign.chat");
  const status = useInboxConnectionStatus();
  const interrupted = useRef(false);
  const [notice, setNotice] = useState<"reconnecting" | "backOnline" | null>(
    null,
  );

  useEffect(() => {
    if (status === "offline") {
      interrupted.current = true;
      setNotice(null);
      return;
    }
    if (status === "reconnecting") {
      setNotice(null);
      const timer = window.setTimeout(() => {
        interrupted.current = true;
        setNotice("reconnecting");
      }, RECONNECT_NOTICE_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    if (interrupted.current) {
      interrupted.current = false;
      setNotice("backOnline");
      const timer = window.setTimeout(
        () => setNotice(null),
        BACK_ONLINE_NOTICE_MS,
      );
      return () => window.clearTimeout(timer);
    }
    setNotice(null);
  }, [status]);

  const message =
    status === "offline"
      ? "offline"
      : status === "reconnecting"
        ? notice === "reconnecting"
          ? notice
          : null
        : notice === "backOnline"
          ? notice
          : null;
  const Icon =
    message === "offline"
      ? WifiOff
      : message === "backOnline"
        ? CircleCheck
        : RefreshCw;

  return (
    <div
      role="status"
      className={
        message
          ? cn(
              "text-foreground flex shrink-0 items-center gap-2 border-b px-4 py-2 text-sm",
              message === "backOnline"
                ? "border-success/25 bg-success/10"
                : "border-warning/25 bg-warning/10",
            )
          : "sr-only"
      }
    >
      {message ? (
        <>
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              message === "backOnline" ? "text-success" : "text-warning",
            )}
          />
          <span>{t(message)}</span>
        </>
      ) : null}
    </div>
  );
}
