"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ClassroomCreatePolicy,
  ClassroomUploadPolicy,
} from "@/lib/classroom";
import { formatBytes } from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";

interface ClassroomSettingsProps {
  slug: string;
}

/**
 * The community's file storage as a bar. Neutral, not Signal Orange (it is
 * a status, not an action); red once the hard limit is reached. Nothing
 * while it loads; a note with a retry if it fails.
 */
function StorageUsage({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.classroom");
  const usage = api.classroomMaterials.usage.useQuery({ slug });
  if (usage.isError) {
    return (
      <div className="space-y-2">
        <Label>{t("storageTitle")}</Label>
        <ErrorState
          className="border-border items-start rounded-lg border px-4 py-4 text-left"
          title={t("storageFailed")}
          description=""
          retryLabel={t("tryAgain")}
          onRetry={() => void usage.refetch()}
        />
      </div>
    );
  }
  if (!usage.data) return null;
  const { fileBytesStored, fileBytesAllowed } = usage.data;
  const full = fileBytesStored >= fileBytesAllowed;
  const percent =
    fileBytesAllowed > 0
      ? Math.min(100, Math.round((fileBytesStored / fileBytesAllowed) * 100))
      : 100;
  return (
    <div className="space-y-2">
      <Label>{t("storageTitle")}</Label>
      {/* Radix gives the bar role="progressbar"; the shared Progress does not
          forward `value` to it, so aria-valuenow is set here. */}
      <Progress
        value={percent}
        aria-label={t("storageTitle")}
        aria-valuenow={percent}
        className="bg-muted"
        indicatorClassName={full ? "bg-destructive" : "bg-foreground/70"}
      />
      <p className="text-muted-foreground font-mono text-xs">
        {t("storageUsed", {
          used: formatBytes(fileBytesStored),
          allowed: formatBytes(fileBytesAllowed),
        })}
      </p>
    </div>
  );
}

export function ClassroomSettings({ slug }: ClassroomSettingsProps) {
  const t = useTranslations("communities.settings.classroom");
  const utils = api.useUtils();

  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  const [policy, setPolicy] = useState<ClassroomCreatePolicy>("all_members");
  const [uploadPolicy, setUploadPolicy] =
    useState<ClassroomUploadPolicy>("admins_only");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (community && !initialized) {
      setPolicy(community.classroomCreatePolicy ?? "all_members");
      setUploadPolicy(community.classroomUploadPolicy ?? "admins_only");
      setInitialized(true);
    }
  }, [community, initialized]);

  const updateMutation = api.communities.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      void utils.communities.getBySlug.invalidate({ slug });
    },
    onError: () => {
      toast.error(t("saveFailed"));
    },
  });

  const handleChange = (value: ClassroomCreatePolicy) => {
    setPolicy(value);
    updateMutation.mutate({ slug, classroomCreatePolicy: value });
  };

  const handleUploadPolicyChange = (value: ClassroomUploadPolicy) => {
    setUploadPolicy(value);
    updateMutation.mutate({ slug, classroomUploadPolicy: value });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="classroomCreatePolicy">{t("policyTitle")}</Label>
        <p className="text-muted-foreground text-sm">{t("policySubtitle")}</p>
        <Select
          value={policy}
          onValueChange={(v) => handleChange(v as ClassroomCreatePolicy)}
          disabled={updateMutation.isPending}
        >
          <SelectTrigger id="classroomCreatePolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_members">{t("policyAllMembers")}</SelectItem>
            <SelectItem value="admins_only">{t("policyAdminsOnly")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="classroomUploadPolicy">{t("uploadPolicyTitle")}</Label>
        <p className="text-muted-foreground text-sm">
          {t("uploadPolicySubtitle")}
        </p>
        <Select
          value={uploadPolicy}
          onValueChange={(v) =>
            handleUploadPolicyChange(v as ClassroomUploadPolicy)
          }
          disabled={updateMutation.isPending}
        >
          <SelectTrigger id="classroomUploadPolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admins_only">
              {t("uploadPolicyAdminsOnly")}
            </SelectItem>
            <SelectItem value="all_members">
              {t("uploadPolicyAllMembers")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <StorageUsage slug={slug} />

      {updateMutation.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" />
        </div>
      )}
    </div>
  );
}
