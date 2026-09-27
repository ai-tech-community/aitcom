"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Quick lesson entry at the end of an outline group: type a title, press
 * Enter, keep typing the next one. The input clears at once and keeps focus;
 * if the add fails, the title comes back so nothing typed is lost.
 */
export function AddLessonRow({
  moduleTitle,
  onAdd,
}: {
  /** The group's module, for the input's label; null in a course without modules. */
  moduleTitle: string | null;
  /** Resolves true when the lesson was added. */
  onAdd: (title: string) => Promise<boolean>;
}) {
  const t = useTranslations("classroomBuilder");
  const [value, setValue] = useState("");

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    setValue("");
    const added = await onAdd(title);
    // Give the title back only if the author has not started the next one.
    if (!added) setValue((current) => (current === "" ? title : current));
  };

  return (
    <div className="relative">
      <Plus
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
      />
      <Input
        value={value}
        maxLength={200}
        placeholder={t("addLessonPlaceholder")}
        aria-label={
          moduleTitle
            ? t("addLessonToModuleLabel", { module: moduleTitle })
            : t("addLessonLabel")
        }
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter or Escape while an input method (IME) is composing belongs to the IME.
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            // Clear only; don't let Escape also close the mobile outline sheet.
            if (value !== "") e.stopPropagation();
            setValue("");
          }
        }}
        className="hover:border-input h-8 border-transparent bg-transparent pl-7 text-sm shadow-none dark:bg-transparent"
      />
    </div>
  );
}
