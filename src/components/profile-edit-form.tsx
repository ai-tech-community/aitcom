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
  /** Account names the event organizer sees (ADR-0038). */
  names?: { firstName: string | null; lastName: string | null } | null;
}

export function ProfileEditForm({ initialData, names }: ProfileEditFormProps) {
  const t = useTranslations("dashboard");
  const utils = api.useUtils();

  const [displayName, setDisplayName] = useState(
    initialData?.displayName ?? "",
  );
  const [firstName, setFirstName] = useState(names?.firstName ?? "");
  const [lastName, setLastName] = useState(names?.lastName ?? "");
  const [bio, setBio] = useState(initialData?.bio ?? "");
  const [skillsText, setSkillsText] = useState(
    (initialData?.skills ?? []).join(", "),
  );
  const [company, setCompany] = useState(initialData?.company ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(
    initialData?.linkedinUrl ?? "",
  );
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
      firstName: firstName.trim(),
      lastName: lastName.trim(),
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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
          {t("displayName")}
        </label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="profile-first-name"
            className="text-muted-foreground font-mono text-xs tracking-wider"
          >
            {t("firstName")}
          </label>
          <Input
            id="profile-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            autoComplete="given-name"
            className="mt-1"
          />
        </div>
        <div>
          <label
            htmlFor="profile-last-name"
            className="text-muted-foreground font-mono text-xs tracking-wider"
          >
            {t("lastName")}
          </label>
          <Input
            id="profile-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            autoComplete="family-name"
            className="mt-1"
          />
        </div>
        <p className="text-muted-foreground text-xs sm:col-span-2">
          {t("namesHint")}
        </p>
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
          <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
          <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
          <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
          className="text-muted-foreground font-mono text-xs tracking-wider"
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
