"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeChecklist({ slug }: { slug: string }) {
  const utils = api.useUtils();
  const { data: stage } = api.activation.myStage.useQuery({ slug });
  const { data: steps, isLoading } = api.onboardingSteps.listForMe.useQuery({
    slug,
  });

  const markComplete = api.onboardingSteps.markComplete.useMutation({
    onSuccess: () => void utils.onboardingSteps.listForMe.invalidate({ slug }),
  });

  // Auto-hide once the member is activated.
  if (stage?.stage === "activated") return null;
  // Loading or no steps configured → render nothing.
  if (isLoading || !steps || steps.length === 0) return null;

  const total = steps.length;
  const done = steps.filter((s) => s.completed).length;

  return (
    <div className="bg-primary/5 border-primary/20 space-y-3 rounded-md border p-4">
      <div>
        <h2 className="font-medium">Welcome to the community</h2>
        <p className="text-muted-foreground text-sm">
          A few steps to help you get started ({done}/{total} done).
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
                href={step.href}
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
                  <Check className="size-4" /> Done
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
                  {pending ? "Saving…" : "Mark done"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
