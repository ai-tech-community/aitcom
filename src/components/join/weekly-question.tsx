import { Link } from "@/i18n/navigation";

import { SectionLabel } from "@/components/ui/section-label";
import type { JoinWeeklyQuestion } from "@/lib/join-page-proof";

/** A real discussion thread. Renders nothing when no thread is configured. */
export function WeeklyQuestion({
  label,
  question,
}: {
  label: string;
  question: JoinWeeklyQuestion | null;
}) {
  if (!question) return null;

  return (
    <section className="mt-16 max-w-2xl" aria-labelledby="join-weekly-question">
      <SectionLabel id="join-weekly-question">{label}</SectionLabel>
      <p className="mt-6 text-lg leading-snug">
        <Link
          href={question.href as never}
          className="underline-offset-4 hover:underline"
          dir="auto"
        >
          {question.title}
        </Link>
      </p>
    </section>
  );
}
