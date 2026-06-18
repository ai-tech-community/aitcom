"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/agent/shared";
import { SectionLabel } from "@/components/ui/section-label";

export function SetupCustom({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>CUSTOM / API</SectionLabel>
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
              {t("endpoint")}
            </span>
            <CopyButton text="https://www.aitcommunity.org/api/mcp" />
          </div>
          <code className="bg-secondary text-foreground block rounded px-3 py-2 font-mono text-sm">
            https://www.aitcommunity.org/api/mcp
          </code>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
              API KEY
            </span>
            <CopyButton text={apiKey} />
          </div>
          <code className="bg-secondary text-foreground block rounded px-3 py-2 font-mono text-sm">
            {apiKey}
          </code>
        </div>
        <span className="text-muted-foreground block font-mono text-[11px] tracking-wider">
          {t("protocol")}
        </span>
      </div>
    </div>
  );
}
