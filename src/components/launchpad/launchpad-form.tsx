"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

type LaunchpadFormProps = {
  mode: "create" | "edit";
  slug?: string; // only for edit mode
};

function plainTextToLexical(text: string) {
  return {
    root: {
      type: "root",
      version: 1,
      children: text
        .split("\n")
        .filter(Boolean)
        .map((para) => ({
          type: "paragraph",
          version: 1,
          children: [{ type: "text", text: para, version: 1, format: 0 }],
          direction: "ltr",
          format: "",
          indent: 0,
        })),
      direction: "ltr",
      format: "",
      indent: 0,
    },
  };
}

function lexicalToPlainText(lexical: unknown): string {
  if (!lexical || typeof lexical !== "object") return "";
  const root = (
    lexical as {
      root?: { children?: Array<{ children?: Array<{ text?: string }> }> };
    }
  ).root;
  if (!root?.children) return "";
  return root.children
    .map((para) =>
      (para.children ?? []).map((node) => node.text ?? "").join(""),
    )
    .join("\n");
}

export function LaunchpadForm({ mode, slug }: LaunchpadFormProps) {
  const t = useTranslations("launchpad.form");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [stage, setStage] = useState<"idea" | "prototype" | "mvp" | "launched">(
    "idea",
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([]);

  // Fetch project data in edit mode
  const { data: project, isLoading: isLoadingProject } =
    api.launchpad.getBySlug.useQuery(
      { slug: slug ?? "" },
      { enabled: mode === "edit" && !!slug },
    );

  // Pre-fill form when project data is loaded
  useEffect(() => {
    if (mode === "edit" && project) {
      setTitle(project.title ?? "");
      setPitch(lexicalToPlainText(project.pitch));
      setStage(project.stage ?? "idea");
      setTags(
        Array.isArray(project.tags)
          ? project.tags.map((t: { tag: string }) => t.tag)
          : [],
      );
      setLinks(
        Array.isArray(project.links)
          ? project.links.map((l: { label: string; url: string }) => ({
              label: l.label,
              url: l.url,
            }))
          : [],
      );
    }
  }, [mode, project]);

  const createMutation = api.launchpad.create.useMutation({
    onSuccess: ({ slug: newSlug }) => {
      toast.success("Project created!");
      router.push(`/launchpad/${newSlug}`);
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error("You must accept the community rules before submitting.");
      } else {
        toast.error(err.message ?? "Failed to create project.");
      }
    },
  });

  const updateMutation = api.launchpad.update.useMutation({
    onSuccess: () => {
      toast.success("Project updated!");
      router.push(`/launchpad/${slug}`);
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error("You must accept the community rules before submitting.");
      } else {
        toast.error(err.message ?? "Failed to update project.");
      }
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Tags helpers
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (tags.length < 10 && !tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
        setTagInput("");
      }
    }
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // Links helpers
  const addLink = () => setLinks([...links, { label: "", url: "" }]);
  const removeLink = (index: number) =>
    setLinks(links.filter((_, i) => i !== index));
  const updateLink = (index: number, field: "label" | "url", value: string) => {
    setLinks(
      links.map((link, i) =>
        i === index ? { ...link, [field]: value } : link,
      ),
    );
  };

  const handleSubmit = (status: "draft" | "published") => {
    const lexicalPitch = plainTextToLexical(pitch);
    const validLinks = links.filter((l) => l.label.trim() && l.url.trim());

    if (mode === "create") {
      createMutation.mutate({
        title,
        pitch: lexicalPitch,
        stage,
        tags,
        links: validLinks,
        status,
      });
    } else if (mode === "edit" && project) {
      updateMutation.mutate({
        projectId: project.id,
        title,
        pitch: lexicalPitch,
        stage,
        tags,
        links: validLinks,
        status,
      });
    }
  };

  if (mode === "edit" && isLoadingProject) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-sm text-zinc-500">
        Loading project...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">
        {mode === "create" ? "Submit Project" : "Edit Project"}
      </h1>

      <div className="flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">{t("title")}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={200}
            disabled={isSubmitting}
          />
        </div>

        {/* Pitch */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pitch">{t("pitch")}</Label>
          <Textarea
            id="pitch"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder={t("pitchPlaceholder")}
            rows={6}
            disabled={isSubmitting}
          />
        </div>

        {/* Stage */}
        <div className="flex flex-col gap-1.5">
          <Label>{t("stage")}</Label>
          <Select
            value={stage}
            onValueChange={(v) =>
              setStage(v as "idea" | "prototype" | "mvp" | "launched")
            }
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="idea">Idea</SelectItem>
              <SelectItem value="prototype">Prototype</SelectItem>
              <SelectItem value="mvp">MVP</SelectItem>
              <SelectItem value="launched">Launched</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tags">{t("tags")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="flex items-center gap-1 pr-1 font-mono text-xs"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  className="ml-0.5 rounded-full hover:bg-zinc-200"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder={t("tagsPlaceholder")}
            disabled={isSubmitting || tags.length >= 10}
          />
          <p className="text-xs text-zinc-400">
            Press Enter to add a tag. Max 10 tags.
          </p>
        </div>

        {/* Links */}
        <div className="flex flex-col gap-2">
          <Label>{t("links")}</Label>
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={link.label}
                onChange={(e) => updateLink(i, "label", e.target.value)}
                placeholder={t("linkLabel")}
                className="flex-1"
                disabled={isSubmitting}
              />
              <Input
                value={link.url}
                onChange={(e) => updateLink(i, "url", e.target.value)}
                placeholder={t("linkUrl")}
                className="flex-[2]"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-700"
                aria-label="Remove link"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLink}
            disabled={isSubmitting || links.length >= 10}
            className="w-fit"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("addLink")}
          </Button>
        </div>

        {/* Cover Image — coming soon */}
        <div className="flex flex-col gap-1.5">
          <Label>{t("coverImage")}</Label>
          <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-400">
            Cover image upload coming soon.
          </p>
        </div>

        {/* Submit buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSubmit("draft")}
            disabled={isSubmitting || !title.trim()}
          >
            {t("saveDraft")}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit("published")}
            disabled={isSubmitting || !title.trim()}
          >
            {mode === "edit" ? t("saveChanges") : t("publish")}
          </Button>
        </div>
      </div>
    </div>
  );
}
