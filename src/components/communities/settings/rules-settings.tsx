"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface RulesSettingsProps {
  slug: string;
}

interface RuleSection {
  title: string;
  slug: string;
  icon?: string;
  content: unknown;
}

const ICON_OPTIONS = [
  { label: "Shield", value: "shield" },
  { label: "Users", value: "users" },
  { label: "Flag", value: "flag" },
  { label: "Scale", value: "scale" },
  { label: "Brain", value: "brain" },
  { label: "Gavel", value: "gavel" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function RulesSettings({ slug }: RulesSettingsProps) {
  const t = useTranslations("communities.settings.rules");
  const utils = api.useUtils();

  const { data: rulesData, isLoading } = api.forum.getRules.useQuery({
    communitySlug: slug,
  });

  const [sections, setSections] = useState<RuleSection[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (rulesData && !initialized) {
      if (rulesData.rules) {
        const ruleSections = (rulesData.rules as { sections?: RuleSection[] })
          .sections;
        if (ruleSections) {
          setSections(
            ruleSections.map((s) => ({
              title: s.title ?? "",
              slug: s.slug ?? "",
              icon: s.icon ?? undefined,
              content: s.content ?? "",
            })),
          );
        }
      }
      setInitialized(true);
    }
  }, [rulesData, initialized]);

  const upsertMutation = api.forum.upsertRules.useMutation({
    onSuccess: () => {
      toast.success(t("published"));
      void utils.forum.getRules.invalidate();
    },
  });

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { title: "", slug: "", icon: undefined, content: "" },
    ]);
  };

  const removeSection = (index: number) => {
    if (window.confirm(t("removeSectionConfirm"))) {
      setSections((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateSection = (index: number, updates: Partial<RuleSection>) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, ...updates };
        if (
          updates.title !== undefined &&
          (s.slug === "" || s.slug === slugify(s.title))
        ) {
          updated.slug = slugify(updates.title);
        }
        return updated;
      }),
    );
  };

  const moveSection = (from: number, to: number) => {
    setSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      return copy;
    });
  };

  const handlePublish = () => {
    if (sections.length === 0) return;
    const hasEmpty = sections.some((s) => !s.title.trim());
    if (hasEmpty) {
      toast.error("All sections must have a title");
      return;
    }

    if (rulesData?.rules) {
      if (!window.confirm(t("publishConfirm"))) return;
    }

    upsertMutation.mutate({
      communitySlug: slug,
      sections: sections.map((s) => ({
        title: s.title,
        slug: s.slug || slugify(s.title),
        icon: s.icon as
          | "shield"
          | "users"
          | "flag"
          | "scale"
          | "brain"
          | "gavel"
          | undefined,
        content: typeof s.content === "string" ? s.content : s.content,
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  const hasRules = !!rulesData?.rules;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          {hasRules && (
            <p className="text-muted-foreground text-sm">
              {t("currentVersion", {
                version: (rulesData.rules as { version?: number }).version ?? 1,
              })}
              {" · "}
              {t("effectiveDate", {
                date: new Date(
                  (rulesData.rules as { effectiveDate?: string })
                    .effectiveDate ?? "",
                ).toLocaleDateString(),
              })}
            </p>
          )}
        </div>
      </div>

      {!hasRules && sections.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground mb-4 text-sm">{t("empty")}</p>
          <Button onClick={addSection}>
            <Plus className="mr-1.5 size-3.5" />
            {t("create")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {sections.map((section, index) => (
              <div key={index} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="text-muted-foreground size-4 cursor-grab" />
                    <span className="text-muted-foreground font-mono text-xs">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveSection(index, index - 1)}
                      >
                        ↑
                      </Button>
                    )}
                    {index < sections.length - 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveSection(index, index + 1)}
                      >
                        ↓
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeSection(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("sectionTitle")}</Label>
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        updateSection(index, { title: e.target.value })
                      }
                      placeholder={t("sectionTitle")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("sectionIcon")}</Label>
                    <Select
                      value={section.icon ?? ""}
                      onValueChange={(v) =>
                        updateSection(index, { icon: v || undefined })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select icon" />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{t("sectionSlug")}</Label>
                  <Input
                    value={section.slug}
                    onChange={(e) =>
                      updateSection(index, { slug: e.target.value })
                    }
                    placeholder="auto-generated-from-title"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{t("sectionContent")}</Label>
                  <Textarea
                    value={
                      typeof section.content === "string" ? section.content : ""
                    }
                    onChange={(e) =>
                      updateSection(index, { content: e.target.value })
                    }
                    placeholder={t("sectionContent")}
                    rows={4}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="mr-1.5 size-3.5" />
              {t("addSection")}
            </Button>
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={upsertMutation.isPending || sections.length === 0}
            >
              {upsertMutation.isPending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              {t("publish")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
