"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/agent/shared";
import { useRevealedKey } from "@/components/agent/revealed-key-context";

export function AgentApiKey() {
  const t = useTranslations("agent");
  const { fullKey, setFullKey } = useRevealedKey();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      setConfirmRegenerate(false);
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

  const handleRegenerateClick = () => {
    if (!hasExistingKey) {
      generateKey.mutate();
      return;
    }
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    generateKey.mutate();
  };

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

          {fullKey ? (
            <div className="rounded border border-yellow-700 bg-yellow-950/40 px-3 py-3">
              <p className="font-mono text-[11px] font-medium tracking-wider text-yellow-300">
                ⚠ COPY NOW — KEY WILL NOT BE SHOWN AGAIN
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                For security, AIT stores only a hash of the key. Once you leave
                or reload this page, only the prefix remains visible. If you
                lose it, use Regenerate to issue a new one.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Lost the key? Use <strong>Regenerate</strong> to issue a new one.
              This invalidates the old key — any agent runtime currently using
              it will stop working until you update its config.
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

      {confirmRegenerate && hasExistingKey ? (
        <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded border p-3">
          <p className="text-foreground text-sm">
            Regenerate will{" "}
            <strong>invalidate the current key immediately</strong>. Any agent
            runtime using it will stop working until you paste the new key into
            its config. Continue?
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={handleRegenerateClick}
              disabled={generateKey.isPending}
            >
              {generateKey.isPending ? "..." : "YES, REGENERATE"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => setConfirmRegenerate(false)}
              disabled={generateKey.isPending}
            >
              CANCEL
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full font-mono text-xs tracking-wider"
          onClick={handleRegenerateClick}
          disabled={generateKey.isPending}
        >
          {generateKey.isPending
            ? "Generating..."
            : hasExistingKey
              ? t("regenerateKey")
              : t("generateKey")}
        </Button>
      )}
    </div>
  );
}
