"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** A form field: its label (Geist Sans, tied to the control) above it. */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

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
  const id = useId();
  const field = (name: string) => `${id}-${name}`;

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id={field("display-name")} label={t("displayName")}>
        <Input
          id={field("display-name")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={field("first-name")} label={t("firstName")}>
          <Input
            id={field("first-name")}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            autoComplete="given-name"
            aria-describedby={field("names-hint")}
          />
        </Field>
        <Field id={field("last-name")} label={t("lastName")}>
          <Input
            id={field("last-name")}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            autoComplete="family-name"
            aria-describedby={field("names-hint")}
          />
        </Field>
        <p
          id={field("names-hint")}
          className="text-muted-foreground -mt-2 text-xs sm:col-span-2"
        >
          {t("namesHint")}
        </p>
      </div>
      <Field id={field("bio")} label={t("bio")}>
        <Textarea
          id={field("bio")}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
      </Field>
      <Field id={field("skills")} label={t("skills")}>
        <Input
          id={field("skills")}
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="AI, Python, LLMs"
        />
      </Field>
      <Field id={field("company")} label={t("company")}>
        <Input
          id={field("company")}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id={field("linkedin")} label={t("linkedinUrl")}>
          <Input
            id={field("linkedin")}
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            type="url"
          />
        </Field>
        <Field id={field("github")} label={t("githubUrl")}>
          <Input
            id={field("github")}
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            type="url"
          />
        </Field>
        <Field id={field("website")} label={t("websiteUrl")}>
          <Input
            id={field("website")}
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            type="url"
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={field("public")}
          tone="ink"
          checked={isPublic}
          onCheckedChange={(checked) => setIsPublic(checked === true)}
        />
        <Label htmlFor={field("public")}>{t("publicProfile")}</Label>
      </div>
      <Button type="submit" disabled={upsertMutation.isPending}>
        {upsertMutation.isPending ? t("saving") : t("saveProfile")}
      </Button>
    </form>
  );
}
