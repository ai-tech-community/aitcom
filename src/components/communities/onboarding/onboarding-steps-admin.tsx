"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = {
  id: string;
  title: string;
  href: string;
  position: number;
};

export function OnboardingStepsAdmin({ slug }: { slug: string }) {
  const t = useTranslations("communities.onboarding");
  const utils = api.useUtils();
  const { data, isLoading, error } = api.onboardingSteps.list.useQuery({
    slug,
  });

  const invalidate = () => utils.onboardingSteps.list.invalidate({ slug });

  const update = api.onboardingSteps.update.useMutation({
    onSuccess: () => void invalidate(),
  });
  const reorder = api.onboardingSteps.reorder.useMutation({
    onSuccess: () => void invalidate(),
  });
  const remove = api.onboardingSteps.remove.useMutation({
    onSuccess: () => void invalidate(),
  });

  // Admin-only surface — hide entirely when the procedure forbids.
  if (error?.data?.code === "FORBIDDEN") return null;

  const steps: Step[] = (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    href: s.href,
    position: s.position,
  }));

  const move = (stepId: string, direction: "up" | "down") => {
    reorder.mutate({ slug, stepId, direction });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("adminTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("adminSubtitle")}</p>
      </div>

      <div className="rounded-lg border">
        {isLoading ? (
          <div
            role="status"
            aria-label={t("loading")}
            className="h-24 animate-pulse"
          />
        ) : steps.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {t("adminEmpty")}
          </p>
        ) : (
          <div className="divide-y">
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                isFirst={i === 0}
                isLast={i === steps.length - 1}
                onMoveUp={() => move(step.id, "up")}
                onMoveDown={() => move(step.id, "down")}
                savePending={
                  update.isPending && update.variables?.stepId === step.id
                }
                deletePending={
                  remove.isPending && remove.variables?.stepId === step.id
                }
                onSave={(title, href) =>
                  update.mutate({ slug, stepId: step.id, title, href })
                }
                onDelete={() => remove.mutate({ slug, stepId: step.id })}
              />
            ))}
          </div>
        )}
      </div>

      <AddStepForm
        slug={slug}
        nextPosition={(steps.at(-1)?.position ?? -1) + 1}
      />
    </div>
  );
}

function StepRow({
  step,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
  savePending,
  deletePending,
}: {
  step: Step;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (title: string, href: string) => void;
  onDelete: () => void;
  savePending: boolean;
  deletePending: boolean;
}) {
  const t = useTranslations("communities.onboarding");
  const [title, setTitle] = useState(step.title);
  const [href, setHref] = useState(step.href);

  const dirty = title !== step.title || href !== step.href;
  const valid = title.trim().length > 0 && href.trim().length > 0;

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label={t("moveUp")}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label={t("moveDown")}
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
            placeholder={t("stepTitlePlaceholder")}
            className="text-sm"
          />
          <Input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            maxLength={500}
            placeholder={t("stepHrefPlaceholder")}
            className="font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={onDelete}
          disabled={deletePending}
        >
          {deletePending ? t("deleting") : t("delete")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(title.trim(), href.trim())}
          disabled={!dirty || !valid || savePending}
        >
          {savePending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

function AddStepForm({
  slug,
  nextPosition,
}: {
  slug: string;
  nextPosition: number;
}) {
  const t = useTranslations("communities.onboarding");
  const utils = api.useUtils();
  const [title, setTitle] = useState("");
  const [href, setHref] = useState("");

  const create = api.onboardingSteps.create.useMutation({
    onSuccess: () => {
      void utils.onboardingSteps.list.invalidate({ slug });
      setTitle("");
      setHref("");
    },
  });

  const valid = title.trim().length > 0 && href.trim().length > 0;

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || create.isPending) return;
        create.mutate({
          slug,
          title: title.trim(),
          href: href.trim(),
          position: nextPosition,
        });
      }}
    >
      <div>
        <Label htmlFor="onboarding-title" className="text-xs">
          {t("addTitle")}
        </Label>
        <Input
          id="onboarding-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          placeholder={t("addTitlePlaceholder")}
          className="mt-1 text-sm"
        />
      </div>
      <div>
        <Label htmlFor="onboarding-href" className="text-xs">
          {t("addLink")}
        </Label>
        <Input
          id="onboarding-href"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          maxLength={500}
          placeholder={t("stepHrefPlaceholder")}
          className="mt-1 font-mono text-xs"
        />
      </div>
      {create.error && (
        <p className="text-destructive text-sm">{create.error.message}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!valid || create.isPending}>
          {create.isPending ? t("adding") : t("addStep")}
        </Button>
      </div>
    </form>
  );
}
