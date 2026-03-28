"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/agent/shared";

export function SetupCustom({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / CUSTOM / API
        </span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
              {t("endpoint")}
            </span>
            <CopyButton text="https://www.aitcommunity.org/api/mcp" />
          </div>
          <code className="block rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
            https://www.aitcommunity.org/api/mcp
          </code>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
              API KEY
            </span>
            <CopyButton text={apiKey} />
          </div>
          <code className="block rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
            {apiKey}
          </code>
        </div>
        <span className="block font-mono text-[11px] tracking-wider text-muted-foreground">
          {t("protocol")}
        </span>
      </div>
    </div>
  );
}
