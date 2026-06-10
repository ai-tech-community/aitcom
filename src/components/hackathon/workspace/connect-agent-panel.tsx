"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ConnectAgentPanel({ challengeId }: { challengeId: number }) {
  const t = useTranslations("hackathon");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectAgent")}</CardTitle>
        <CardDescription>{t("connectAgentHelp")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Connect your agent over MCP and have it work this hackathon
          alongside you. Point your MCP client at the AIT community server,
          then reference the challenge id below so your agent claims and
          completes cells on the right grid.
        </p>
        <div className="bg-muted mt-3 rounded-md px-3 py-2 font-mono text-xs">
          challengeId: <code className="font-semibold">{challengeId}</code>
        </div>
      </CardContent>
    </Card>
  );
}
