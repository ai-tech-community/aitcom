"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface IntegrationsSettingsProps {
  slug: string;
}

export function IntegrationsSettings({ slug }: IntegrationsSettingsProps) {
  const t = useTranslations("communities.settings.integrations.luma");
  const tPage = useTranslations("communities.settings.integrations");
  const utils = api.useUtils();

  const { data: config, isLoading } = api.luma.getConfig.useQuery({
    communitySlug: slug,
  });

  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const connectMutation = api.luma.connect.useMutation({
    onSuccess: (data) => {
      if (data.calendars.length === 1) {
        selectCalendarMutation.mutate({
          communitySlug: slug,
          calendarApiId: data.calendars[0]!.api_id,
          calendarName: data.calendars[0]!.name,
        });
      }
      setApiKey("");
      setShowKeyInput(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const selectCalendarMutation = api.luma.selectCalendar.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
      toast.success(t("testSuccess"));
    },
  });

  const disconnectMutation = api.luma.disconnect.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
    },
  });

  const toggleMutation = api.luma.updateConfig.useMutation({
    onSuccess: () => {
      void utils.luma.getConfig.invalidate();
    },
  });

  const testMutation = api.luma.testConnection.useMutation({
    onSuccess: () => {
      toast.success(t("testSuccess"));
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const isConnected = config && config.calendarApiId !== "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {tPage("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{tPage("description")}</p>
      </div>

      <div className="border-border rounded-lg border p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium">{t("title")}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("description")}
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="mt-4 space-y-3">
            <div className="bg-secondary/50 flex items-center justify-between rounded-md px-3 py-2">
              <div>
                <span className="text-sm font-medium">{t("calendarLabel")}: </span>
                <span className="text-sm">{config.calendarName}</span>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                {config.isEnabled ? t("enabled") : t("disabled")}
              </span>
            </div>

            {config.lastSyncCheck && (
              <p className="text-muted-foreground text-xs">
                {t("lastSync")}: {new Date(config.lastSyncCheck).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toggleMutation.mutate({
                    communitySlug: slug,
                    isEnabled: !config.isEnabled,
                  })
                }
                disabled={toggleMutation.isPending}
              >
                {config.isEnabled ? t("disabled") : t("enabled")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate({ communitySlug: slug })}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? t("testing") : t("testConnection")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(t("disconnectConfirm"))) {
                    disconnectMutation.mutate({ communitySlug: slug });
                  }
                }}
                disabled={disconnectMutation.isPending}
              >
                {t("disconnect")}
              </Button>
            </div>
          </div>
        ) : showKeyInput ? (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">{t("apiKeyLabel")}</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t("apiKeyPlaceholder")}
                className="mt-1"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {t("apiKeyHelp")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  connectMutation.mutate({
                    communitySlug: slug,
                    apiKey,
                  })
                }
                disabled={connectMutation.isPending || !apiKey}
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    {t("connecting")}
                  </>
                ) : (
                  t("connect")
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowKeyInput(false);
                  setApiKey("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => setShowKeyInput(true)}
            >
              {t("connect")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
