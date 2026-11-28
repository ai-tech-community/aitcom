"use client";

import styles from "./classroom.module.css";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { builderErrorKey } from "@/components/classroom/builder/builder-errors";

import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";

const MIN_TITLE = 3;

/**
 * The first step of a new course: only a working title. The course is created
 * as a draft and the author lands in the builder, where everything else is
 * filled in and autosaved.
 */
export function NewCourseForm({ slug }: { slug: string }) {
  const t = useTranslations("classroomBuilder");
  const learning = useTranslations("redesign.classroom");
  const redesigned = isOpenCommunitiesEnabled();
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const titleId = useId();
  const hintId = useId();

  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);

  const create = api.classrooms.create.useMutation({
    onSuccess: ({ slug: newSlug }) => {
      router.replace(`/communities/${slug}/classroom/${newSlug}/edit` as never);
    },
    onError: (err) => toast.error(t(builderErrorKey(err.message))),
  });

  const trimmed = title.trim();
  const tooShort = trimmed.length < MIN_TITLE;
  const showHint = touched && tooShort;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (tooShort) {
      setTouched(true);
      return;
    }
    requireAuth(
      () => create.mutate({ communitySlug: slug, title: trimmed }),
      t("signInToCreate"),
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      data-classroom-redesign={redesigned ? "" : undefined}
      className={
        redesigned
          ? `mx-auto max-w-xl space-y-7 py-3 sm:py-7 ${styles.controls}`
          : "mx-auto max-w-lg space-y-6 py-6"
      }
    >
      {redesigned ? (
        <Button asChild variant="ghost" className="-ml-2">
          <Link href={`/communities/${slug}/classroom` as never}>
            <ArrowLeft aria-hidden="true" /> {learning("courses")}
          </Link>
        </Button>
      ) : null}
      <div className="space-y-2">
        {redesigned ? null : (
          <SectionLabel as="p" bordered={false}>
            {t("newCourseKicker")}
          </SectionLabel>
        )}
        <h1
          className={
            redesigned
              ? "font-community-heading text-3xl font-semibold tracking-tight sm:text-5xl"
              : "font-community-heading text-2xl font-semibold tracking-tight"
          }
        >
          {t("newCourseTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("newCourseLead")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{t("titleLabel")}</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={200}
          autoFocus={!redesigned}
          aria-invalid={showHint || undefined}
          aria-describedby={showHint ? hintId : undefined}
          disabled={create.isPending}
        />
        {showHint ? (
          <p id={hintId} className="text-destructive text-sm">
            {t("titleTooShort")}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={create.isPending}>
        {t("createCourse")}
      </Button>
    </form>
  );
}
