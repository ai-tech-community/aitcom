"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeChecklist({ slug }: { slug: string }) {
  const t = useTranslations("communities.onboarding");
  const utils = api.useUtils();
  const { data: stage } = api.activation.myStage.useQuery({ slug });
  const { data: steps, isLoading } = api.onboardingSteps.listForMe.useQuery({
    slug,
  });

  const markComplete = api.onboardingSteps.markComplete.useMutation({
    onSuccess: () => void utils.onboardingSteps.listForMe.invalidate({ slug }),
  });

  // Wait for stage; suppress (don't flash) until we know the member isn't activated.
  if (stage === undefined) return null;
  if (stage.stage === "activated") return null;
  // Loading or no steps configured → render nothing.
  if (isLoading || !steps || steps.length === 0) return null;

  const total = steps.length;
  const done = steps.filter((s) => s.completed).length;

  return (
    <div className="bg-primary/5 border-primary/20 space-y-3 rounded-md border p-4">
      <div>
        <h2 className="font-medium">{t("welcomeTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("welcomeSubtitle", { done, total })}
        </p>
      </div>
      <ul className="divide-y">
        {steps.map((step) => {
          const pending =
            markComplete.isPending &&
            markComplete.variables?.stepId === step.id;
          return (
            <li
              key={step.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <Link
                href={step.href as never}
                className={
                  step.completed
                    ? "text-muted-foreground text-sm line-through"
                    : "text-sm font-medium hover:underline"
                }
              >
                {step.title}
              </Link>
              {step.completed ? (
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                  <Check className="size-4" /> {t("done")}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => markComplete.mutate({ slug, stepId: step.id })}
                  disabled={pending}
                >
                  <Circle className="size-3" />
                  {pending ? t("saving") : t("markDone")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
