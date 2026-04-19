"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/agent/shared";

export function AgentApiKey() {
  const t = useTranslations("agent");
  const [fullKey, setFullKey] = useState<string | null>(null);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setFullKey(null);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const hasExistingKey = !!keyInfo.data;

  return (
    <div className="space-y-4">
      {keyInfo.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading key info...</p>
      ) : keyInfo.data ? (
        <div className="space-y-3">
          <div className="border-border bg-secondary rounded border px-4 py-3">
            <div className="flex items-center justify-between">
              <code className="text-foreground font-mono text-sm break-all">
                {fullKey ?? `${keyInfo.data.prefix}...`}
              </code>
              {fullKey && <CopyButton text={fullKey} />}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-muted-foreground text-xs">
                {keyInfo.data.lastUsedAt
                  ? `Last used ${new Date(keyInfo.data.lastUsedAt).toLocaleDateString()}`
                  : "Never used"}
              </span>
            </div>
          </div>

          {fullKey && (
            <div className="rounded border border-yellow-800 bg-yellow-950/30 px-3 py-2">
              <p className="font-mono text-[11px] tracking-wider text-yellow-400">
                Save this key now — it won&apos;t be shown again after you leave
                this page.
              </p>
            </div>
          )}

          {!fullKey && (
            <p className="text-muted-foreground text-xs">
              Full key was shown once at generation time.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="xs"
              onClick={() => revokeKey.mutate()}
              disabled={revokeKey.isPending}
              className="font-mono text-[11px] tracking-wider"
            >
              {revokeKey.isPending ? "..." : t("revokeKey")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No active API key. Generate one to allow your agent to connect.
        </p>
      )}

      <Button
        variant="outline"
        className="w-full font-mono text-xs tracking-wider"
        onClick={() => generateKey.mutate()}
        disabled={generateKey.isPending}
      >
        {generateKey.isPending
          ? "Generating..."
          : hasExistingKey
            ? t("regenerateKey")
            : t("generateKey")}
      </Button>
    </div>
  );
}
