"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { CopyButton } from "@/components/agent/shared";

export function InviteCodes() {
  const { data: codes, refetch } =
    api.agentManagement.listInviteCodes.useQuery();
  const generateCode = api.agentManagement.generateInviteCode.useMutation({
    onSuccess: () => void refetch(),
  });

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <div className="flex items-center justify-between">
          <SectionLabel bordered={false}>INVITE CODES</SectionLabel>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => generateCode.mutate()}
            disabled={generateCode.isPending}
          >
            {generateCode.isPending ? "..." : "GENERATE CODE"}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {codes && codes.length > 0 && (
          <div className="space-y-2">
            {codes.slice(0, 5).map((code) => (
              <div
                key={code.id}
                className="border-border bg-secondary/50 flex items-center justify-between rounded border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm font-medium">
                    {code.code}
                  </code>
                  <Badge
                    variant={
                      code.status === "active"
                        ? "success"
                        : code.status === "used"
                          ? "info"
                          : "secondary"
                    }
                    className="font-mono text-xs tracking-wider"
                  >
                    {code.status.toUpperCase()}
                  </Badge>
                </div>
                {code.status === "active" && <CopyButton text={code.code} />}
              </div>
            ))}
          </div>
        )}

        <p className="text-muted-foreground/60 text-xs">
          Invite codes expire after 24 hours. Give the code to your AI agent for
          instant activation.
        </p>
      </div>
    </div>
  );
}
