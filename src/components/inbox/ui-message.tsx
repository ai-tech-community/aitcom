"use client";

import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { AppRenderer } from "@mcp-ui/client";
import { env } from "@/env.js";
import { api } from "@/trpc/react";
import { isChatUiEnabled } from "@/lib/chat/flags";
import type { UiResource } from "@/lib/chat/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type UiMessageProps = {
  conversationId: string;
  resource: UiResource;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders an MCP-Apps UI resource inside a sandboxed AppRenderer iframe.
 * Parents should only mount this when isChatUiEnabled() is true; the component
 * also re-checks the flag at runtime (returns null) as a defensive guard.
 *
 * Sandbox isolation: allow-scripts only (no allow-same-origin) so the
 * guest iframe cannot access host cookies / localStorage.
 */
export function UiMessage({ conversationId, resource }: UiMessageProps) {
  const locale = useLocale();
  const { resolvedTheme } = useTheme();

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

  // ── hostContext ───────────────────────────────────────────────────────────

  const theme =
    resolvedTheme === "dark" ? ("dark" as const) : ("light" as const);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isChatUiEnabled()) return null;

  return (
    <div
      className="border-border overflow-hidden rounded-md border"
      style={{ minHeight: "240px" }}
    >
      <AppRenderer
        toolName="inbox.uiMessage"
        html={resource.content}
        sandbox={{
          url: sandboxUrl,
          permissions: "allow-scripts",
        }}
        hostContext={{ theme, locale }}
        onMessage={handleMessage}
        onCallTool={handleCallTool}
        onOpenLink={handleOpenLink}
      />
    </div>
  );
}
