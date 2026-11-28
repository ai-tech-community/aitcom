import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export function SetupStepStatus({
  done,
  completionId,
}: {
  done?: boolean;
  completionId?: string;
}) {
  const t = useTranslations("redesign.creation.welcome");
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {done === undefined ? (
        <Skeleton className="size-4 rounded-full" />
      ) : done ? (
        <>
          <Check className="text-success size-4" aria-hidden="true" />
          <span id={completionId} className="sr-only">
            {t("stepComplete")}
          </span>
        </>
      ) : (
        <Circle className="text-muted-foreground size-3.5" aria-hidden="true" />
      )}
    </span>
  );
}
