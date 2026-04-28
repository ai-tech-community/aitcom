import { Link } from "@/i18n/navigation";

type FlagBucket = { count: number; samples: string[] };

type RedFlags = {
  noSources: FlagBucket;
  noPowerSource: FlagBucket;
  stuckAnnounced: FlagBucket;
  highConcentration: FlagBucket;
  wideCommitmentGap: FlagBucket;
  singleSupplierDep: FlagBucket;
};

type Phase5Counts = {
  fastPermitCount: number;
  deepOwnershipCount: number;
  subsidyMismatchCount: number;
};

type FlagDef = {
  key: keyof RedFlags;
  label: string;
  description: string;
  warrants: string;
  /** sampleHrefBuilder: build href from sample slug; null when sample is a country/operator label not a route */
  sampleHrefBuilder: ((sample: string) => string) | null;
};

const FLAGS: FlagDef[] = [
  {
    key: "noSources",
    label: "Facilities with no sources",
    description: "Verified entries that lack any cited URL.",
    warrants: "review provenance",
    sampleHrefBuilder: (s) => `/investigations/datacenters/${s}`,
  },
  {
    key: "noPowerSource",
    label: "No power source disclosed",
    description: "No primary energy source recorded — can't assess emissions.",
    warrants: "data gap",
    sampleHrefBuilder: (s) => `/investigations/datacenters/${s}`,
  },
  {
    key: "stuckAnnounced",
    label: "Stuck since announcement",
    description: "Announced 5+ years ago, not yet operational, not cancelled.",
    warrants: "verify status",
    sampleHrefBuilder: (s) => `/investigations/datacenters/${s}`,
  },
  {
    key: "highConcentration",
    label: "Countries with high operator concentration",
    description: "HHI ≥ 2500 — single operator dominates national MW.",
    warrants: "market structure review",
    sampleHrefBuilder: null,
  },
  {
    key: "wideCommitmentGap",
    label: "Operators ≥30pp behind clean-energy commitment",
    description: "Public commitment vs. actual carbon-free MW share.",
    warrants: "claim verification",
    sampleHrefBuilder: null,
  },
  {
    key: "singleSupplierDep",
    label: "Single-supplier dependency (3+ categories)",
    description: "One vendor serves 3+ functional categories at the same site.",
    warrants: "supply concentration review",
    sampleHrefBuilder: (s) => `/investigations/datacenters/${s}`,
  },
];

export function RedFlagsPanel({
  flags,
  phase5,
}: {
  flags: RedFlags;
  phase5?: Phase5Counts;
}) {
  return (
    <div className="space-y-3">
      <div className="border-border/60 rounded-md border border-dashed bg-amber-50/30 p-3 text-xs leading-relaxed dark:bg-amber-950/10">
        <strong className="text-amber-700 dark:text-amber-400">
          Patterns warrant review, not accusations.
        </strong>{" "}
        These flags surface entries that deviate from peers or expose data gaps.
        They are descriptive, not editorial. Investigative judgments belong in
        published findings with sourcing and right of reply.
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {phase5 && (
          <>
            <Phase5Card
              label="Permits granted unusually fast"
              description="Issued <14 days after application — verify regulatory process."
              count={phase5.fastPermitCount}
              warrants="permit timing review"
            />
            <Phase5Card
              label="Operators with 3+ ownership layers"
              description="Chain depth ≥3 — shell stacking signal."
              count={phase5.deepOwnershipCount}
              warrants="ownership review"
            />
            <Phase5Card
              label="Subsidies > $1M per claimed job"
              description="Disclosed subsidy ÷ claimed jobs exceeds $1M."
              count={phase5.subsidyMismatchCount}
              warrants="benefit-cost review"
            />
          </>
        )}
        {FLAGS.map((f) => {
          const bucket = flags[f.key];
          const empty = bucket.count === 0;
          return (
            <div
              key={f.key}
              className={`border-border rounded-lg border p-3 ${
                empty ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{f.label}</h3>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs text-white ${
                    empty
                      ? "bg-muted-foreground/40"
                      : bucket.count >= 10
                        ? "bg-red-600"
                        : bucket.count >= 3
                          ? "bg-amber-500"
                          : "bg-sky-600"
                  }`}
                >
                  {bucket.count}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {f.description}
              </p>
              <p className="text-muted-foreground/70 mt-1 text-[10px] tracking-wider uppercase">
                → {f.warrants}
              </p>
              {bucket.samples.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {bucket.samples.slice(0, 5).map((s, i) => (
                    <li key={i} className="truncate">
                      {f.sampleHrefBuilder ? (
                        <Link
                          href={f.sampleHrefBuilder(s)}
                          className="hover:underline"
                        >
                          {s}
                        </Link>
                      ) : (
                        <span>{s}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Phase5Card({
  label,
  description,
  count,
  warrants,
}: {
  label: string;
  description: string;
  count: number;
  warrants: string;
}) {
  const empty = count === 0;
  return (
    <div
      className={`border-border rounded-lg border p-3 ${empty ? "opacity-60" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs text-white ${
            empty
              ? "bg-muted-foreground/40"
              : count >= 5
                ? "bg-red-600"
                : "bg-amber-500"
          }`}
        >
          {count}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {description}
      </p>
      <p className="text-muted-foreground/70 mt-1 text-[10px] tracking-wider uppercase">
        → {warrants}
      </p>
      {empty && (
        <p className="text-muted-foreground/60 mt-1 text-[10px]">
          (awaiting Phase 6 seed)
        </p>
      )}
    </div>
  );
}
