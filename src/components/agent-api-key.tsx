"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function AgentApiKey() {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      setCopied(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setNewKey(null);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasExistingKey = !!keyInfo.data;

  return (
    <div className="space-y-4">
      {/* Current key info */}
      {keyInfo.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading key info...</p>
      ) : keyInfo.data ? (
        <div className="flex items-center justify-between rounded border border-border bg-secondary px-4 py-3">
          <div>
            <span className="font-mono text-sm text-foreground">
              {keyInfo.data.prefix}...
            </span>
            <span className="ml-3 text-xs text-muted-foreground">
              {keyInfo.data.lastUsedAt
                ? `Last used ${new Date(keyInfo.data.lastUsedAt).toLocaleDateString()}`
                : "Never used"}
            </span>
          </div>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => revokeKey.mutate()}
            disabled={revokeKey.isPending}
            className="font-mono text-[11px] tracking-wider"
          >
            {revokeKey.isPending ? "Revoking..." : "Revoke"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No active API key. Generate one to allow your agent to connect.
        </p>
      )}

      {/* New key warning box */}
      {newKey && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="mb-2 font-mono text-xs font-medium tracking-wider text-yellow-400">
            SAVE THIS KEY NOW — IT WILL NOT BE SHOWN AGAIN
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
              {newKey}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 font-mono text-[11px] tracking-wider"
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {/* Generate / Regenerate button */}
      <Button
        variant="outline"
        className="w-full font-mono text-xs tracking-wider"
        onClick={() => generateKey.mutate()}
        disabled={generateKey.isPending}
      >
        {generateKey.isPending
          ? "Generating..."
          : hasExistingKey
            ? "Regenerate Key"
            : "Generate API Key"}
      </Button>

      {/* Example config */}
      <div>
        <p className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground">
          EXAMPLE CLAUDE CODE CONFIG
        </p>
        <pre className="overflow-x-auto rounded border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{`{
  "mcpServers": {
    "ait-community": {
      "command": "npx",
      "args": ["ait-agent-mcp"],
      "env": {
        "AIT_API_KEY": "<your-key-here>"
      }
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
