"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ProfileEditFormProps {
  initialData?: {
    displayName: string;
    bio: string | null;
    skills: string[];
    company: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
    isPublic: boolean;
  } | null;
}

export function ProfileEditForm({ initialData }: ProfileEditFormProps) {
  const t = useTranslations("dashboard");
  const utils = api.useUtils();

  const [displayName, setDisplayName] = useState(initialData?.displayName ?? "");
  const [bio, setBio] = useState(initialData?.bio ?? "");
  const [skillsText, setSkillsText] = useState(
    (initialData?.skills ?? []).join(", "),
  );
  const [company, setCompany] = useState(initialData?.company ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialData?.linkedinUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(initialData?.githubUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl ?? "");
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);

  const upsertMutation = api.members.upsertProfile.useMutation({
    onSuccess: () => {
      toast.success(t("profileSaved"));
      void utils.members.getMyProfile.invalidate();
    },
    onError: () => {
      toast.error(t("profileError"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const skills = skillsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    upsertMutation.mutate({
      displayName,
      bio: bio || null,
      skills,
      company: company || null,
      linkedinUrl: linkedinUrl || null,
      githubUrl: githubUrl || null,
      websiteUrl: websiteUrl || null,
      isPublic,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("displayName")}
        </label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("bio")}
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="border-border bg-background mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("skills")}
        </label>
        <Input
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="AI, Python, LLMs"
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("company")}
        </label>
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("linkedinUrl")}
          </label>
          <Input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("githubUrl")}
          </label>
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("websiteUrl")}
          </label>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          id="isPublic"
          className="rounded"
        />
        <label
          htmlFor="isPublic"
          className="text-muted-foreground font-mono text-[11px] tracking-wider"
        >
          {t("publicProfile")}
        </label>
      </div>
      <Button
        type="submit"
        className="w-full font-mono text-xs tracking-wider"
        disabled={upsertMutation.isPending}
      >
        {upsertMutation.isPending ? t("saving") : t("saveProfile")}
      </Button>
    </form>
  );
}
