"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface SettingsFormProps {
  slug: string;
  initialData: {
    name: string;
    description: string | null;
    logoUrl: string | null;
    joinPolicy: "open" | "invite_only" | "approval_required";
    isListedInDirectory: boolean;
    feedPostPolicy: "all_members" | "admins_only";
  };
}

export function SettingsForm({ slug, initialData }: SettingsFormProps) {
  const t = useTranslations("communities.manage");
  const utils = api.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(
    initialData.description ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(initialData.logoUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [joinPolicy, setJoinPolicy] = useState<
    "open" | "invite_only" | "approval_required"
  >(initialData.joinPolicy);
  const [isListedInDirectory, setIsListedInDirectory] = useState(
    initialData.isListedInDirectory,
  );
  const [feedPostPolicy, setFeedPostPolicy] = useState<"all_members" | "admins_only">(initialData.feedPostPolicy);

  const updateMutation = api.communities.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settingsSaved"));
      void utils.communities.invalidate();
    },
    onError: () => {
      toast.error(t("settingsError"));
    },
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", `${name} logo`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json() as { url: string };
      setLogoUrl(data.url);
    } catch {
      toast.error(t("logoUploadError"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      slug,
      name,
      description: description || undefined,
      logoUrl: logoUrl ?? null,
      joinPolicy,
      isListedInDirectory,
      feedPostPolicy,
    });
  };

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo Upload */}
      <div className="space-y-2">
        <Label>{t("logo")}</Label>
        <p className="text-muted-foreground text-sm">{t("logoDescription")}</p>
        <div className="flex items-center gap-4">
          <Avatar className="size-16 rounded-xl text-lg">
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={name} />
            ) : null}
            <AvatarFallback className="rounded-xl text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  {t("logoUploading")}
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 size-4" />
                  {t("logoUpload")}
                </>
              )}
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLogoUrl(null)}
              >
                <X className="mr-1.5 size-4" />
                {t("logoRemove")}
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="feedPostPolicy">{t("feedPostPolicy")}</Label>
        <Select
          value={feedPostPolicy}
          onValueChange={(v) => setFeedPostPolicy(v as "all_members" | "admins_only")}
        >
          <SelectTrigger id="feedPostPolicy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_members">{t("feedPolicyAllMembers")}</SelectItem>
            <SelectItem value="admins_only">{t("feedPolicyAdminsOnly")}</SelectItem>
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
