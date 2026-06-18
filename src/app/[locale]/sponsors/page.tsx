import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { SponsorApplicationModal } from "@/components/sponsor-application-modal";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Sponsors",
  description:
    "Support the AI Tech Community. Sponsor tiers, benefits, and current partners.",
  ...buildOgMeta(
    "Sponsors",
    "Support the AI Tech Community. Sponsor tiers, benefits, and current partners.",
    "Sponsors",
  ),
  alternates: buildAlternates("/sponsors"),
};

const tierOrder = { gold: 0, silver: 1, bronze: 2 } as const;

const benefits = [
  { key: "benefitLogo", bronze: "yes", silver: "yes", gold: "yes" },
  { key: "benefitHomepage", bronze: "no", silver: "yes", gold: "larger" },
  { key: "benefitJobs", bronze: "1", silver: "3", gold: "jobsUnlimited" },
  {
    key: "benefitChallenges",
    bronze: "challengesOne",
    silver: "challengesThree",
    gold: "challengesUnlimited",
  },
  {
    key: "benefitSponsorReward",
    bronze: "rewardNone",
    silver: "rewardText",
    gold: "rewardFull",
  },
  { key: "benefitEvents", bronze: "no", silver: "yes", gold: "coHost" },
  {
    key: "benefitNewsletter",
    bronze: "quarterly",
    silver: "monthly",
    gold: "monthlySocial",
  },
] as const;

export default async function SponsorsPage() {
  const t = await getTranslations("sponsors");

  const payload = await getPayloadClient();
  const { docs: sponsors } = await payload.find({
    collection: "sponsors",
    where: { status: { equals: "active" } },
    limit: 100,
    depth: 1,
  });

  const sortedSponsors = sponsors.sort(
    (a, b) => (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Hero */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>
      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("heroDescription")}
        </p>
      </div>

      {/* Tier Comparison Table */}
      <section className="mt-16">
        <div className="border-border border-b pb-4">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("tiersTitle").toUpperCase()}
          </h2>
        </div>
        {/* Desktop table */}
        <div className="mt-6 hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground py-3 pr-4 text-left font-mono text-xs font-medium tracking-wider">
                  BENEFIT
                </th>
                {(["bronze", "silver", "gold"] as const).map((tier) => (
                  <th
                    key={tier}
                    className="text-muted-foreground px-4 py-3 text-center font-mono text-xs font-medium tracking-wider"
                  >
                    {t(
                      `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as
                        | "tierGold"
                        | "tierSilver"
                        | "tierBronze",
                    ).toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benefits.map((row) => (
                <tr key={row.key} className="border-border border-b">
                  <td className="py-3 pr-4 font-mono text-xs">{t(row.key)}</td>
                  {(["bronze", "silver", "gold"] as const).map((tier) => {
                    const val = row[tier];
                    const display = /^\d+$/.test(val)
                      ? val
                      : t(val as Parameters<typeof t>[0]);
                    return (
                      <td
                        key={tier}
                        className="px-4 py-3 text-center font-mono text-xs"
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="mt-6 space-y-3 sm:hidden">
          {benefits.map((row) => (
            <div key={row.key} className="border-border rounded-lg border p-3">
              <p className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                {t(row.key)}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["bronze", "silver", "gold"] as const).map((tier) => {
                  const val = row[tier];
                  const display = /^\d+$/.test(val)
                    ? val
                    : t(val as Parameters<typeof t>[0]);
                  return (
                    <div key={tier} className="text-center">
                      <span className="text-muted-foreground font-mono text-xs tracking-wider">
                        {t(
                          `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as
                            | "tierGold"
                            | "tierSilver"
                            | "tierBronze",
                        )}
                      </span>
                      <p className="mt-0.5 font-mono text-xs font-medium">
                        {display}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Publish Challenges */}
      <section className="mt-16">
        <div className="border-border border-b pb-4">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("challengesTitle").toUpperCase()}
          </h2>
        </div>
        <div className="mt-8 max-w-2xl">
          <p className="text-muted-foreground text-base leading-relaxed">
            {t("challengesDescription")}
          </p>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {(["publish", "engage", "discover"] as const).map((step, i) => (
            <div key={step} className="border-border rounded-lg border p-6">
              <span className="text-muted-foreground font-mono text-xs tracking-wider">
                0{i + 1}
              </span>
              <h3 className="mt-2 text-lg font-semibold">
                {t(`challengeSteps.${step}`)}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {t(`challengeSteps.${step}Desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Current Sponsors */}
      <section className="mt-16">
        <div className="border-border border-b pb-4">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("currentSponsors").toUpperCase()}
          </h2>
        </div>
        {sortedSponsors.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center font-mono text-xs tracking-wider">
            {t("noSponsors")}
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
            {sortedSponsors.map((sponsor) => {
              const logo =
                typeof sponsor.logo === "object" ? sponsor.logo : null;
              return (
                <a
                  key={sponsor.id}
                  href={sponsor.website ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border hover:border-foreground/30 flex flex-col items-center gap-3 rounded-lg border p-3 transition-colors sm:p-6"
                >
                  {logo?.url && (
                    <Image
                      src={logo.url}
                      alt={sponsor.name}
                      width={120}
                      height={60}
                      className="h-12 w-auto object-contain"
                    />
                  )}
                  <span className="text-sm font-medium">{sponsor.name}</span>
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider uppercase">
                    {sponsor.tier}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="mt-16 flex justify-center">
        <SponsorApplicationModal />
      </section>
    </div>
  );
}
