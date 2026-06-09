"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ClassroomSettingsProps {
  slug: string;
}

type ClassroomCreatePolicy = "all_members" | "admins_only";

export function ClassroomSettings({ slug }: ClassroomSettingsProps) {
  const t = useTranslations("communities.settings.classroom");
  const utils = api.useUtils();

  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  const [policy, setPolicy] = useState<ClassroomCreatePolicy>("all_members");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (community && !initialized) {
      setPolicy(community.classroomCreatePolicy ?? "all_members");
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

      {updateMutation.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" />
        </div>
      )}
    </div>
  );
}
