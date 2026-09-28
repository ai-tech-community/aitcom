"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";

/**
 * The course title as the builder's page heading, renamed in place: click it,
 * type, Enter (or leave the field) to keep, Escape to cancel. A title under
 * the minimum shows why and is not kept. Without `onRename` (an archived
 * course) it is plain text.
 *
 * Keeping a title hands it to `onRename`; the builder puts it in the same
 * course draft the details pane edits, so both show one title and every save
 * goes through the one course writer.
 */
export function CourseTitleEditor({
  title,
  onRename,
}: {
  title: string;
  onRename?: (title: string) => void;
}) {
  const t = useTranslations("classroomBuilder");
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const editing = value !== null;

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const close = () => {
    returnFocus.current = true;
    setTooShort(false);
    setValue(null);
  };

  const keep = () => {
    if (value === null) return;
    const next = value.trim();
    if (next.length < COURSE_TITLE_MIN) {
      setTooShort(true);
      return;
    }
    if (next !== title) onRename?.(next);
    close();
  };

  if (!onRename) {
    return <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>;
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={inputId} className="sr-only">
          {t("courseTitleInput")}
        </label>
        <Input
          id={inputId}
          autoFocus
          value={value}
          maxLength={200}
          onChange={(e) => {
            setValue(e.target.value);
            setTooShort(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              keep();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          onBlur={keep}
          aria-invalid={tooShort || undefined}
          aria-describedby={tooShort ? hintId : undefined}
          className="h-8 w-72 max-w-full text-sm font-semibold"
        />
        {tooShort ? (
          <p id={hintId} className="text-destructive text-xs">
            {t("titleTooShort")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <h1 className="min-w-0 text-sm font-semibold">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setValue(title)}
        className="hover:bg-muted focus-visible:ring-ring/50 group -mx-1 inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none focus-visible:ring-[3px]"
      >
        <span className="truncate">{title}</span>
        <Pencil
          className="text-muted-foreground group-hover:text-foreground size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span className="sr-only">{t("renameCourse")}</span>
      </button>
    </h1>
  );
}
