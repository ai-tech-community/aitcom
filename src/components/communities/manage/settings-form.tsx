"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SettingsFormProps {
  slug: string;
  initialData: {
    name: string;
    description: string | null;
    joinPolicy: "open" | "invite_only" | "approval_required";
    isListedInDirectory: boolean;
  };
}

export function SettingsForm({ slug, initialData }: SettingsFormProps) {
  const t = useTranslations("communities.manage");
  const utils = api.useUtils();

  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(
    initialData.description ?? "",
  );
  const [joinPolicy, setJoinPolicy] = useState<
    "open" | "invite_only" | "approval_required"
  >(initialData.joinPolicy);
  const [isListedInDirectory, setIsListedInDirectory] = useState(
    initialData.isListedInDirectory,
  );

  const updateMutation = api.communities.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settingsSaved"));
      void utils.communities.invalidate();
    },
    onError: () => {
      toast.error(t("settingsError"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      slug,
      name,
      description: description || undefined,
      joinPolicy,
      isListedInDirectory,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">{t("communityName")}</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={100}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="joinPolicy">{t("joinPolicy")}</Label>
        <Select
          value={joinPolicy}
          onValueChange={(v) =>
            setJoinPolicy(
              v as "open" | "invite_only" | "approval_required",
            )
          }
        >
          <SelectTrigger id="joinPolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("joinPolicyOpen")}</SelectItem>
            <SelectItem value="invite_only">
              {t("joinPolicyInviteOnly")}
            </SelectItem>
            <SelectItem value="approval_required">
              {t("joinPolicyApprovalRequired")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="listed">{t("listedInDirectory")}</Label>
          <p className="text-muted-foreground text-sm">
            {t("listedInDirectoryDescription")}
          </p>
        </div>
        <Switch
          id="listed"
          checked={isListedInDirectory}
          onCheckedChange={setIsListedInDirectory}
        />
      </div>

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("saving")}
          </>
        ) : (
          t("saveSettings")
        )}
      </Button>
    </form>
  );
}
