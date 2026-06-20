"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AppRenderer } from "@mcp-ui/client";
import { AppWindowIcon } from "lucide-react";
import { env } from "@/env.js";
import { api } from "@/trpc/react";
import { isChatUiEnabled } from "@/lib/chat/flags";
import type { UiResource } from "@/lib/chat/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type UiMessageProps = {
  conversationId: string;
  resource: UiResource;
};

// The guest reports its own height via `ui/notifications/size-changed`; the host
// clamps it so a misbehaving (or non-reporting → AppFrame's 600px default) app
// can never blow out the message column. MAX is a hair under the typical pane.
const MIN_FRAME_HEIGHT = 88;
const MAX_FRAME_HEIGHT = 420;
// If a guest never reports a size, stop showing the skeleton after this long.
const REVEAL_FALLBACK_MS = 1200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders an MCP-Apps UI resource inside a sandboxed AppRenderer iframe, framed
 * as a labelled "app" surface in the conversation. Parents should only mount
 * this when isChatUiEnabled() is true; the component also re-checks the flag at
 * runtime (returns null) as a defensive guard.
 *
 * Sandbox isolation comes from the SEPARATE ORIGIN of the proxy
 * (NEXT_PUBLIC_CHAT_SANDBOX_URL), not from the sandbox attribute: the MCP Apps
 * proxy protocol requires `allow-same-origin` (it reads document.referrer and
 * writes into the inner iframe), so the outer iframe uses the SDK default
 * `allow-scripts allow-same-origin allow-forms`. Because the proxy lives on a
 * different origin than the app, the guest still cannot reach host cookies.
 */
export function UiMessage({ conversationId, resource }: UiMessageProps) {
  const locale = useLocale();
  const t = useTranslations("inbox");
  const { resolvedTheme } = useTheme();

  // ── Frame lifecycle state ─────────────────────────────────────────────────

  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  // Reveal the frame once the guest reports a size; fall back on a timer so a
  // guest that never reports doesn't sit under a skeleton forever.
  const readyRef = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (!readyRef.current) setReady(true);
    }, REVEAL_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

  // ── tRPC mutations ───────────────────────────────────────────────────────

  const sendMessage = api.inbox.sendMessage.useMutation();
  const callUiTool = api.inbox.callUiTool.useMutation();

  // ── Sandbox URL ──────────────────────────────────────────────────────────

  const sandboxUrl = new URL(
    env.NEXT_PUBLIC_CHAT_SANDBOX_URL ?? "/sandbox_proxy.html",
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * onMessage: guest sends a chat message → post it into the conversation.
   * params.content is ContentBlock[]; extract text from text blocks.
   */
  const handleMessage: NonNullable<
    React.ComponentProps<typeof AppRenderer>["onMessage"]
  > = async (params) => {
    const text = params.content
      .filter(
        (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
      )
      .map((b) => b.text)
      .join("\n")
      .trim();

    const finalText = text || JSON.stringify(params);

    await sendMessage.mutateAsync({ conversationId, content: finalText });

    return {};
  };

  /**
   * onCallTool: guest invokes a tool → proxy through the UI-tool bridge.
   * Returns a standard MCP CallToolResult.
   */
  const handleCallTool: NonNullable<
    React.ComponentProps<typeof AppRenderer>["onCallTool"]
  > = async (params) => {
    const result = await callUiTool.mutateAsync({
      conversationId,
      name: params.name,
      args: params.arguments as Record<string, unknown>,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result ?? {}) }],
    };
  };

  /**
   * onOpenLink: open external https URLs in a new tab.
   * Blocks non-https for security; returns isError for blocked cases.
   */
  const handleOpenLink: NonNullable<
    React.ComponentProps<typeof AppRenderer>["onOpenLink"]
  > = async ({ url }) => {
    if (typeof url === "string" && url.startsWith("https://")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return {};
    }
    return { isError: true };
  };

  /** onSizeChanged: guest reports its content size → fit (clamped) + reveal. */
  const handleSizeChanged: NonNullable<
    React.ComponentProps<typeof AppRenderer>["onSizeChanged"]
  > = ({ height: h }) => {
    readyRef.current = true;
    setReady(true);
    if (typeof h === "number" && h > 0) {
      setHeight(
        Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(h))),
      );
    }
  };

  // ── hostContext ───────────────────────────────────────────────────────────

  const theme =
    resolvedTheme === "dark" ? ("dark" as const) : ("light" as const);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isChatUiEnabled()) return null;

  if (errored) {
    return (
      <div className="border-border text-muted-foreground flex w-[min(100%,30rem)] items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm">
        <AppWindowIcon className="size-4 shrink-0" aria-hidden />
        <span>{t("uiMessageError")}</span>
      </div>
    );
  }

  return (
    <figure className="border-border bg-card w-[min(100%,30rem)] overflow-hidden rounded-lg border">
      <figcaption className="border-border bg-muted/50 flex items-center gap-1.5 border-b px-3 py-1.5">
        <AppWindowIcon
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
          / app
        </span>
        <span className="sr-only">{t("uiMessageSandboxed")}</span>
      </figcaption>

      <div
        className="relative"
        style={{
          height: height != null ? `${height}px` : undefined,
          maxHeight: `${MAX_FRAME_HEIGHT}px`,
          minHeight: ready ? undefined : `${MIN_FRAME_HEIGHT}px`,
        }}
      >
        <div
          className={cn(
            "h-full overflow-auto transition-opacity duration-200 ease-out motion-reduce:transition-none",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <AppRenderer
            toolName="inbox.uiMessage"
            html={resource.content}
            sandbox={{
              url: sandboxUrl,
              permissions: "allow-scripts allow-same-origin allow-forms",
            }}
            hostContext={{ theme, locale }}
            onMessage={handleMessage}
            onCallTool={handleCallTool}
            onOpenLink={handleOpenLink}
            onSizeChanged={handleSizeChanged}
            onError={() => setErrored(true)}
          />
        </div>

        {!ready && (
          <div className="absolute inset-0 p-3" aria-hidden>
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        )}
      </div>
    </figure>
  );
}
