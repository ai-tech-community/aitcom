import { SectionLabel } from "@/components/ui/section-label";
import type {
  SourcedFactId,
  StartupSourcedAnswer as StartupSourcedAnswerData,
} from "@/lib/investigations/startup-sourced-answers";

const FACT_LABELS: Record<SourcedFactId, { en: string; nl: string }> = {
  does: { en: "What it does", nl: "Wat het doet" },
  founders: { en: "Founders", nl: "Oprichters" },
  funding: { en: "Funding", nl: "Financiering" },
};

/**
 * Server-rendered answers. Each sentence keeps the link to the page it came
 * from. Topics with no sourced sentence are left out.
 */
export function StartupSourcedAnswer({
  answer,
  locale,
}: {
  answer: StartupSourcedAnswerData;
  locale: string;
}) {
  const lang = locale === "nl" ? "nl" : "en";

  return (
    <section data-startup-sourced-answer="" className="mt-12">
      <SectionLabel as="h2">{lang === "nl" ? "Kort" : "In short"}</SectionLabel>
      <div className="mt-6 flex flex-col gap-5">
        {answer.statements.map((fact) => (
          <div key={fact.id} data-sourced-fact={fact.id}>
            <p className="text-sm font-medium">{FACT_LABELS[fact.id][lang]}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {fact.text}{" "}
              <a
                href={fact.sourceUrl}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {fact.sourceLabel}
              </a>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
