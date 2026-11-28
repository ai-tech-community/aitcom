import { ArrowLeft, ArrowRight, Award, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function CourseFinish({
  title,
  heading,
  progress,
  certificate,
  certificateHref,
  coursesHref,
  accent,
}: {
  title: string;
  heading: ReactNode;
  progress: ReactNode;
  certificate: ReactNode;
  certificateHref?: string;
  coursesHref: string;
  accent: boolean;
}) {
  const t = useTranslations("redesign.classroom");
  return (
    <section className="border-border mx-auto mt-6 max-w-2xl space-y-7 rounded-xl border p-6 sm:mt-12 sm:p-10">
      <header className="space-y-3">
        <div className="bg-muted grid size-12 place-items-center rounded-lg">
          <Check aria-hidden="true" className="size-6" />
        </div>
        {heading}
        <p className="text-muted-foreground text-base [overflow-wrap:anywhere]">
          {t("finishSummary", { title })}
        </p>
      </header>
      <div className="border-border space-y-5 border-y py-5">
        {progress}
        {certificate}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={accent ? "default" : "ink"}>
          {certificateHref ? (
            <Link href={certificateHref as never}>
              <Award aria-hidden="true" />
              {t("viewCertificate")}
            </Link>
          ) : (
            <Link href={coursesHref as never}>
              {t("browseCourses")}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </Button>
        {certificateHref ? (
          <Button asChild variant="ghost">
            <Link href={coursesHref as never}>
              <ArrowLeft aria-hidden="true" />
              {t("backToCourses")}
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
