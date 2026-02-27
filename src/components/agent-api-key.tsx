"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function AgentApiKey() {
  const t = useTranslations("agent");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      setShowKey(true);
      setCopied(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setFullKey(null);
      setShowKey(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const handleCopy = async () => {
    const text = fullKey ?? keyInfo.data?.prefix ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasExistingKey = !!keyInfo.data;

  return (
    <div className="space-y-4">
      {keyInfo.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading key info...</p>
      ) : keyInfo.data ? (
        <div className="rounded border border-border bg-secondary px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <code className="break-all font-mono text-sm text-foreground">
                {showKey && fullKey ? fullKey : `${keyInfo.data.prefix}...`}
              </code>
              <span className="ml-3 text-xs text-muted-foreground">
                {keyInfo.data.lastUsedAt
                  ? `Last used ${new Date(keyInfo.data.lastUsedAt).toLocaleDateString()}`
                  : "Never used"}
              </span>
            </div>
            <div className="ml-3 flex items-center gap-2">
              {fullKey && (
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
                >
                  {showKey ? t("hideKey") : t("showKey")}
                </button>
              )}
              {fullKey && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleCopy}
                  className="font-mono text-[11px] tracking-wider"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              )}
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
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
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
