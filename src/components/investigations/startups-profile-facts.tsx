import { SectionLabel } from "@/components/ui/section-label";
import { StartupsMap } from "@/components/investigations/startups-map";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  formatStartupPinCoords,
  parseStartupListedOn,
  presentText,
  startupReferenceSources,
  type StartupLocale,
  type StartupMapPin,
  type StartupProfileFact,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

export type StartupsProfileFactsCopy = {
  factsTitle: string;
  factRegion: string;
  factStage: string;
  factListed: string;
  factSources: string;
};

/** Label on the left, value on the right, a dotted leader between them. */
const leaderTerm =
  "text-muted-foreground flex flex-1 items-baseline gap-2 font-mono text-xs font-medium tracking-wider whitespace-nowrap uppercase after:border-border after:min-w-6 after:flex-1 after:translate-y-[-0.2em] after:border-b after:border-dotted after:content-['']";

/**
 * Spec sheet of sourced facts. Rows with no data are never rendered, so a
 * thin record stays short instead of showing blanks.
 */
export function StartupsProfileFacts({
  facts,
  card,
  locale,
  copy,
}: {
  facts: readonly StartupProfileFact[];
  card: StartupPublicCard;
  locale: StartupLocale;
  copy: StartupsProfileFactsCopy;
}) {
  if (facts.length === 0) return null;
  const lines = facts.filter((fact) => fact !== "sources");
  const references = facts.includes("sources")
    ? startupReferenceSources(card.sources)
    : [];

  return (
    <section
      aria-labelledby="startup-facts"
      data-startup-profile-facts=""
      className="flex flex-col gap-5"
    >
      <SectionLabel id="startup-facts">{copy.factsTitle}</SectionLabel>
      <dl className="flex flex-col gap-3.5">
        {lines.map((fact) => (
          <div
            key={fact}
            data-startup-fact={fact}
            className="flex items-baseline gap-2"
          >
            <dt className={leaderTerm}>{factLabel(fact, copy)}</dt>
            <dd className="max-w-[65%] text-right text-sm text-balance">
              <FactValue fact={fact} card={card} />
            </dd>
          </div>
        ))}
        {references.length > 0 ? (
          <div data-startup-fact="sources" className="flex flex-col gap-2.5">
            <dt className={leaderTerm}>{copy.factSources}</dt>
            <dd>
              <StartupsSourceChips sources={references} locale={locale} />
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function factLabel(
  fact: StartupProfileFact,
  copy: StartupsProfileFactsCopy,
): string {
  switch (fact) {
    case "region":
      return copy.factRegion;
    case "stage":
      return copy.factStage;
    case "listed":
      return copy.factListed;
    case "sources":
      return copy.factSources;
  }
}

function FactValue({
  fact,
  card,
}: {
  fact: StartupProfileFact;
  card: StartupPublicCard;
}) {
  switch (fact) {
    case "region": {
      const region = presentText(card.region);
      return <span data-startup-region={region ?? ""}>{region}</span>;
    }
    case "stage": {
      const stage = presentText(card.stage);
      return <span data-startup-stage={stage ?? ""}>{stage}</span>;
    }
    case "listed": {
      const listed = parseStartupListedOn(card.listedOn);
      return (
        <time
          dateTime={listed ?? undefined}
          className="font-mono text-xs tabular-nums"
        >
          {listed}
        </time>
      );
    }
    case "sources":
      return null;
  }
}

/** The pin on a small map, captioned with its approximate coordinates. */
export function StartupsProfileLocation({
  pin,
  label,
}: {
  pin: StartupMapPin;
  label: string;
}) {
  return (
    <section
      aria-labelledby="startup-location"
      data-startup-profile-location=""
      className="flex flex-col gap-5"
    >
      <SectionLabel id="startup-location">{label}</SectionLabel>
      <figure className="flex flex-col gap-2">
        <StartupsMap pins={[pin]} height={240} />
        <figcaption
          data-startup-coords=""
          className="text-muted-foreground font-mono text-xs tabular-nums"
        >
          {formatStartupPinCoords(pin)}
        </figcaption>
      </figure>
    </section>
  );
}
